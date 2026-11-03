namespace Depth;

public static class SourceDiffTest
{
    public static void Run(Action<bool, string> check)
    {
        static string[] Lines(string text) => text.Length == 0 ? [] : (text.EndsWith('\n') ? text[..^1] : text).Split('\n');
        static bool Reconstruct(string before, string after, SourceDiff diff)
        {
            var old = Lines(before); var output = new List<string>(); int cursor = 0;
            foreach (var hunk in diff.Hunks)
            {
                int start = hunk.BeforeStart - (hunk.BeforeCount > 0 ? 1 : 0);
                output.AddRange(old.Skip(cursor).Take(start - cursor)); cursor = start;
                foreach (var row in hunk.Lines)
                {
                    if (row.Kind != "added") { if (cursor >= old.Length || old[cursor] != row.Text || row.BeforeLine != cursor + 1) return false; cursor++; }
                    if (row.Kind != "removed") { if (row.AfterLine != output.Count + 1) return false; output.Add(row.Text); }
                }
            }
            output.AddRange(old.Skip(cursor));
            return output.SequenceEqual(Lines(after));
        }
        var cases = new[] {
            ("", "new\n"), ("gone\n", ""), ("a\nb\nc", "a\nB\nc"),
            ("a\na\nb\na\n", "a\nb\na\na\n"), ("한글\n🍀\n", "한글\n🌱\n"),
            ("a\nb", "a\nb\n"), ("a\nb\n", "a\nb"), ("", "\n"), ("\n", "")
        };
        check(cases.All(c => Reconstruct(c.Item1, c.Item2, SourceDiff.Compare(c.Item1, c.Item2))), "Line hunks reconstruct additions, deletions, repeated lines, Unicode and final-newline edits");
        var original = string.Join('\n', Enumerable.Range(1, 60).Select(i => "line " + i));
        var modified = original.Replace("line 4\n", "changed 4\n").Replace("line 49\n", "changed 49\n");
        var separated = SourceDiff.Compare(original, modified);
        check(separated.Hunks.Length == 2 && separated.Added == 2 && separated.Removed == 2 && Reconstruct(original, modified, separated), "Distant edits retain separate numbered hunks and three context lines");
        var largeOld = string.Join('\n', Enumerable.Range(0, 1100).Select(i => "old" + i));
        var largeNew = string.Join('\n', Enumerable.Range(0, 1100).Select(i => "new" + i));
        var coarse = SourceDiff.Compare(largeOld, largeNew);
        check(coarse.Coarse && coarse.Added == 1100 && coarse.Removed == 1100 && Reconstruct(largeOld, largeNew, coarse), "Large line comparisons bound quadratic work and disclose lossless coarse replacements");
        var eol = SourceDiff.Compare("a\r\nb\r\n", "a\nb\n");
        check(eol.Hunks.Length == 0 && eol.LineEndingsChanged && eol.BeforeFinalNewline && eol.AfterFinalNewline, "Line-ending-only changes are explicit without inventing text edits");
        var random = new Random(310);
        check(Enumerable.Range(0, 150).All(_ => {
            string Text() => string.Join('\n', Enumerable.Range(0, random.Next(0, 35)).Select(_ => "v" + random.Next(8)));
            var a = Text(); var b = Text(); return Reconstruct(a, b, SourceDiff.Compare(a, b));
        }), "Randomized repeated-line diffs preserve exact line content and coordinates");
    }
}
