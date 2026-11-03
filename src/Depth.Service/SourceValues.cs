using System.Globalization;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace Depth;

// Locations come from language ASTs, not text matching or guessed runtime values.
public record SourceValue(string EntityId, string Path, int Offset, int Length, int Line,
    string Kind, string Value, string Literal, string Label, string Type = "");
public record AdapterValue(string Owner, string Path, int Offset, int Length, int Line,
    string Kind, string Value, string Literal, string Label, string Type = "");
public static class SourceValues
{
    public static string Key(SourceValue value) => Wire.Id("value", value.Path + ":" + value.Offset);
    public static bool Matches(SourceValue value, string source) => value.Offset >= 0 && value.Length > 0 &&
        value.Offset <= source.Length - value.Length && source.Substring(value.Offset, value.Length) == value.Literal &&
        value.Kind is "number" or "string" or "boolean" or "character";
    public static SourceValue[] CSharp(Graph graph, Dictionary<string, string> sources)
    {
        var result = new List<SourceValue>();
        foreach (var file in sources.Where(p => p.Key.EndsWith(".cs", StringComparison.OrdinalIgnoreCase)))
        {
            var root = CSharpSyntaxTree.ParseText(file.Value, CompilerConfiguration.ParseOptions(graph.Root, file.Key)).GetRoot();
            var nodes = root.DescendantNodes().ToArray();
            var owners = new Dictionary<SyntaxNode, string>();
            foreach (var entity in graph.Entities)
                foreach (var anchor in entity.Anchors.Where(a => a.Path == file.Key))
                {
                    var matches = nodes.Where(n => n.GetLocation().GetLineSpan().StartLinePosition.Line + 1 == anchor.StartLine &&
                        (n is VariableDeclaratorSyntax v && v.Identifier.Text == entity.Name ||
                         n is MethodDeclarationSyntax m && m.Identifier.Text == entity.Name ||
                         n is TypeDeclarationSyntax t && t.Identifier.Text == entity.Name ||
                         n is PropertyDeclarationSyntax p && p.Identifier.Text == entity.Name ||
                         n is ConstructorDeclarationSyntax && entity.Name is ".ctor" or ".cctor")).ToArray();
                    if (matches.Length == 1) owners[matches[0]] = entity.Id;
                }
            foreach (var literal in nodes.OfType<LiteralExpressionSyntax>())
            {
                string kind = literal.Kind() switch { SyntaxKind.NumericLiteralExpression => "number", SyntaxKind.StringLiteralExpression => "string",
                    SyntaxKind.CharacterLiteralExpression => "character", SyntaxKind.TrueLiteralExpression or SyntaxKind.FalseLiteralExpression => "boolean", _ => "" };
                if (kind.Length == 0) continue;
                var owner = literal.Ancestors().FirstOrDefault(owners.ContainsKey); if (owner == null) continue;
                ExpressionSyntax expression = literal;
                if (kind == "number" && literal.Parent is PrefixUnaryExpressionSyntax sign && sign.Kind() is SyntaxKind.UnaryMinusExpression or SyntaxKind.UnaryPlusExpression) expression = sign;
                var value = kind == "boolean" ? literal.IsKind(SyntaxKind.TrueLiteralExpression) ? "true" : "false" : Convert.ToString(literal.Token.Value, CultureInfo.InvariantCulture) ?? "";
                if (expression.IsKind(SyntaxKind.UnaryMinusExpression)) value = "-" + value;
                var declaration = expression.Parent is EqualsValueClauseSyntax ? expression.Ancestors().OfType<VariableDeclarationSyntax>().FirstOrDefault() : null;
                string type = kind == "number" ? literal.Token.Value?.GetType().Name ?? "" : "";
                if (declaration != null && declaration.Type.ToString() != "var") type = declaration.Type.ToString();
                if (expression.Parent is EqualsValueClauseSyntax && expression.Parent.Parent is PropertyDeclarationSyntax property) type = property.Type.ToString();
                var variable = expression.Ancestors().OfType<VariableDeclaratorSyntax>().FirstOrDefault();
                string label = variable?.Identifier.Text ?? (expression.Ancestors().OfType<AssignmentExpressionSyntax>().FirstOrDefault()?.Left.ToString()) ?? "Literal";
                result.Add(new(owners[owner], file.Key, expression.SpanStart, expression.Span.Length,
                    expression.GetLocation().GetLineSpan().StartLinePosition.Line + 1, kind, value, expression.ToString(), label, type));
            }
        }
        return result.ToArray();
    }

    public static string Encode(SourceValue binding, string value, string language)
    {
        if (value.Length > 100000) throw new InvalidOperationException("Source value is too long.");
        if (binding.Kind == "boolean") return value is "true" or "false" ? value : throw new InvalidOperationException("Choose true or false.");
        if (binding.Kind == "character") return value.Length == 1 ? SymbolDisplay.FormatLiteral(value[0], true) : throw new InvalidOperationException("A C# character must contain exactly one UTF-16 character.");
        if (binding.Kind == "string")
        {
            if (language == "csharp") return SymbolDisplay.FormatLiteral(value, true);
            var quoted = JsonSerializer.Serialize(value);
            // Dart interpolation remains literal data, never newly executable code.
            return language == "dart" ? quoted.Replace("$", "\\$") : quoted;
        }
        if (!double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) || !double.IsFinite(number))
            throw new InvalidOperationException("Enter a finite number, not a code expression.");
        var integer = binding.Type switch {
            "byte" or "Byte" => (0m, (decimal)byte.MaxValue), "sbyte" or "SByte" => ((decimal)sbyte.MinValue, (decimal)sbyte.MaxValue),
            "short" or "Int16" => ((decimal)short.MinValue, (decimal)short.MaxValue), "ushort" or "UInt16" => (0m, (decimal)ushort.MaxValue),
            "int" or "Int32" when language != "dart" => ((decimal)int.MinValue, (decimal)int.MaxValue),
            "uint" or "UInt32" => (0m, (decimal)uint.MaxValue), "long" or "Int64" => ((decimal)long.MinValue, (decimal)long.MaxValue),
            "ulong" or "UInt64" => (0m, (decimal)ulong.MaxValue),
            "int" when language == "dart" => ((decimal)long.MinValue, (decimal)long.MaxValue), _ => ((decimal?)null, (decimal?)null)
        };
        string encoded;
        if (integer.Item1.HasValue)
        {
            if (!decimal.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var exact) || decimal.Truncate(exact) != exact || exact < integer.Item1 || exact > integer.Item2)
                throw new InvalidOperationException("Value is outside the source integer type's range.");
            encoded = exact.ToString("0", CultureInfo.InvariantCulture);
        }
        else if (binding.Type is "decimal" or "Decimal")
        {
            if (!decimal.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var exact)) throw new InvalidOperationException("Value is outside the decimal range.");
            encoded = exact.ToString(CultureInfo.InvariantCulture);
        }
        else
        {
            if (binding.Type is "float" or "Single" && !float.IsFinite((float)number)) throw new InvalidOperationException("Value is outside the float range.");
            encoded = number.ToString("R", CultureInfo.InvariantCulture);
        }
        if (language == "csharp") encoded += binding.Type switch { "float" or "Single" => "f", "double" or "Double" => "d", "decimal" or "Decimal" => "m", "ulong" or "UInt64" => "UL", "long" or "Int64" => "L", "uint" or "UInt32" => "U", _ => "" };
        if (language == "dart" && binding.Type == "double" && !encoded.Contains('.') && !encoded.Contains('E')) encoded += ".0";
        return encoded;
    }
}
