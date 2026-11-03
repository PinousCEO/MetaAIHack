using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace Depth;
public static class SourceValuesTest
{
    public static void Run(string directory, Action<bool,string> check, Action<Action,string> reject)
    {
        Directory.CreateDirectory(directory);var root=Path.Combine(directory,"project");Directory.CreateDirectory(root);
        var file=Path.Combine(root,"Settings.cs");
        const string source="""
        public class Settings {
          public int Count = 3;
          public bool Enabled = true;
          public string Caption = "Original";
          public decimal Rate = 0.123456789012345678901m;
          public char Symbol = 'A';
          public double Price => 48.0;
          public double Compute(double x) { return x * 0.2 + 10; }
        }
        """;
        File.WriteAllText(file,source);var ws=new Workspace(Path.Combine(directory,"state"));var graph=ws.Import(root);
        ModuleCard Card(string name)=>ws.Index.Build(ws.Require()).Cards.Single(c=>c.Name==name);
        Proposal Edit(string name,string value)=>ws.Index.ProposeProperty(ws,new(Card(name).Id,value,ws.Require().Revision));
        check(Card("Enabled").Properties.Single().Kind=="boolean"&&Card("Caption").Properties.Single().Kind=="string","Source values expose real boolean and string literals");
        check(Card("Compute").Properties.Length==2&&Card("Price").Properties.Single().Value=="48","Method and expression-property literals are editable with exact keys");
        reject(()=>Edit("Compute","3"),"Ambiguous multi-value requests require an exact property key");
        reject(()=>Edit("Count","2.5"),"Integer source values reject fractions");
        reject(()=>Edit("Count","2147483648"),"Integer source values reject overflow");
        reject(()=>Edit("Price","NaN"),"Numeric source values reject NaN");
        reject(()=>Edit("Price","1; Dangerous()"),"Numeric edits cannot inject a code expression");
        reject(()=>Edit("Enabled","yes"),"Boolean source values reject invalid words");
        reject(()=>Edit("Symbol","AB"),"Character source values preserve one-character type");
        var caption=Card("Caption");var boolean=Card("Enabled");
        const string text="Quote \" and newline\nwith $value";
        var batch=ws.Index.ProposeProperty(ws,new(caption.Id,"",graph.Revision,Changes:[new(caption.Id,text,caption.Properties.Single().Key),new(boolean.Id,"false",boolean.Properties.Single().Key)]));
        check(File.ReadAllText(file)==source&&batch.Edits.Length==1,"Batch preparation preserves original source and combines one file once");
        ws.Apply(batch.Id,true);var parsed=CSharpSyntaxTree.ParseText(File.ReadAllText(file)).GetRoot();
        check(parsed.DescendantNodes().OfType<VariableDeclaratorSyntax>().Single(v=>v.Identifier.Text=="Caption").Initializer!.Value is LiteralExpressionSyntax s&&s.Token.ValueText==text,"String edits escape data and preserve exact intended text");
        check(Card("Enabled").Properties.Single().Value=="false","Batch edit updates boolean together with string");
        reject(()=>ws.Index.ProposeProperty(ws,new(caption.Id,"stale",graph.Revision,caption.Properties.Single().Key)),"A stale value editor cannot overwrite newer source");
        var undo=ws.ProposeUndo(batch.Id);ws.Apply(undo.Id,true);check(File.ReadAllText(file)==source,"Value change undo restores the exact prior source");
        var decimalEdit=Edit("Rate","0.987654321098765432109");ws.Apply(decimalEdit.Id,true);
        check(File.ReadAllText(file).Contains("0.987654321098765432109m"),"Decimal edits preserve precision and source suffix");
        var compute=Card("Compute");var first=compute.Properties[0];
        reject(()=>ws.Index.ProposeProperty(ws,new(compute.Id,"",ws.Require().Revision,Changes:[new(compute.Id,"0.3",first.Key),new(compute.Id,"0.4",first.Key)])),"Duplicate source-location edits cannot be applied in one batch");
    }
}
