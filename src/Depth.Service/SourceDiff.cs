namespace Depth;

public record DiffLine(string Kind, int BeforeLine, int AfterLine, string Text);
public record DiffHunk(int BeforeStart, int BeforeCount, int AfterStart, int AfterCount, DiffLine[] Lines);
public record SourceDiff(DiffHunk[] Hunks, int Added, int Removed, bool Coarse, bool BeforeFinalNewline,
    bool AfterFinalNewline, bool LineEndingsChanged)
{
    // Bound quadratic work after stripping identical prefix/suffix. A coarse replacement is
    // still lossless; it deliberately does not claim a minimal edit or semantic move.
    public static SourceDiff Compare(string before, string after)
    {
        static string Normalize(string s) => s.Replace("\r\n", "\n").Replace('\r', '\n');
        static string[] Lines(string s) => s.Length == 0 ? [] : (s.EndsWith('\n') ? s[..^1] : s).Split('\n');
        var oldText = Normalize(before); var newText = Normalize(after);
        var a = Lines(oldText); var b = Lines(newText);
        int prefix = 0, suffix = 0;
        while (prefix < a.Length && prefix < b.Length && a[prefix] == b[prefix]) prefix++;
        while (suffix < a.Length - prefix && suffix < b.Length - prefix && a[^(suffix + 1)] == b[^(suffix + 1)]) suffix++;
        int n = a.Length - prefix - suffix, m = b.Length - prefix - suffix;
        bool coarse = (long)(n + 1) * (m + 1) > 1_000_000;
        var result = new List<DiffLine>(); int oldLine = 1, newLine = 1;
        void Emit(string kind, string text) => result.Add(new(kind, kind == "added" ? 0 : oldLine++, kind == "removed" ? 0 : newLine++, text));
        for (int k = 0; k < prefix; k++) Emit("context", a[k]);
        if (coarse || n == 0 || m == 0)
        {
            for (int k = 0; k < n; k++) Emit("removed", a[prefix + k]);
            for (int k = 0; k < m; k++) Emit("added", b[prefix + k]);
        }
        else
        {
            var lengths = new int[n + 1, m + 1];
            for (int x = n - 1; x >= 0; x--)
                for (int y = m - 1; y >= 0; y--)
                    lengths[x, y] = a[prefix + x] == b[prefix + y] ? lengths[x + 1, y + 1] + 1 : Math.Max(lengths[x + 1, y], lengths[x, y + 1]);
            int i = 0, j = 0;
            while (i < n || j < m)
            {
                if (i < n && j < m && a[prefix + i] == b[prefix + j]) { Emit("context", a[prefix + i++]); j++; }
                else if (i < n && (j == m || lengths[i + 1, j] >= lengths[i, j + 1])) Emit("removed", a[prefix + i++]);
                else Emit("added", b[prefix + j++]);
            }
        }
        for (int k = a.Length - suffix; k < a.Length; k++) Emit("context", a[k]);
        var beforeOffsets = new int[result.Count + 1]; var afterOffsets = new int[result.Count + 1];
        for (int k = 0; k < result.Count; k++)
        {
            beforeOffsets[k + 1] = beforeOffsets[k] + (result[k].Kind == "added" ? 0 : 1);
            afterOffsets[k + 1] = afterOffsets[k] + (result[k].Kind == "removed" ? 0 : 1);
        }
        var hunks = new List<DiffHunk>(); int start = -1, end = -1;
        void Finish()
        {
            if (start < 0) return;
            var lines = result.GetRange(start, end - start).ToArray();
            int beforeStart = beforeOffsets[start], afterStart = afterOffsets[start];
            int beforeCount = lines.Count(l => l.Kind != "added"), afterCount = lines.Count(l => l.Kind != "removed");
            hunks.Add(new(beforeStart + (beforeCount > 0 ? 1 : 0), beforeCount, afterStart + (afterCount > 0 ? 1 : 0), afterCount, lines));
        }
        for (int k = 0; k < result.Count; k++)
        {
            if (result[k].Kind == "context") continue;
            int nextStart = Math.Max(0, k - 3), nextEnd = Math.Min(result.Count, k + 4);
            if (start >= 0 && nextStart > end) { Finish(); start = -1; }
            if (start < 0) start = nextStart;
            end = nextEnd;
        }
        Finish();
        return new(hunks.ToArray(), result.Count(l => l.Kind == "added"), result.Count(l => l.Kind == "removed"), coarse,
            oldText.EndsWith('\n'), newText.EndsWith('\n'), before != after && oldText == newText);
    }
}
