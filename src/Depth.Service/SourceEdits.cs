using System.Text;

namespace Depth;

// All project writes remain behind Workspace.Apply's review/revision gate.
public static class SourceEdits
{
    public static bool BeforeMatches(string root, Edit edit)
    {
        var path=SourceAccess.Resolve(root,edit.Path);
        return edit.Operation=="create" ? !File.Exists(path)&&!Directory.Exists(path)
            : File.Exists(path)&&Wire.Hash(File.ReadAllText(path))==edit.ExpectedHash;
    }
    public static bool AfterMatches(string root, Edit edit)
    {
        var path=SourceAccess.Resolve(root,edit.Path);
        return edit.Operation=="delete" ? !File.Exists(path)&&!Directory.Exists(path)
            : File.Exists(path)&&File.ReadAllBytes(path).SequenceEqual(new UTF8Encoding(false).GetBytes(edit.Content));
    }
    public static bool OriginalMatches(string root, Edit edit, byte[] original)
    {
        var path=SourceAccess.Resolve(root,edit.Path);
        return edit.Operation=="create" ? !File.Exists(path)&&!Directory.Exists(path)
            : File.Exists(path)&&File.ReadAllBytes(path).SequenceEqual(original);
    }
    public static void Write(string root, Edit edit)
    {
        if(!BeforeMatches(root,edit))throw new InvalidOperationException("Concurrent source edit or path collision: "+edit.Path);
        var path=SourceAccess.Resolve(root,edit.Path);
        if(edit.Operation=="delete"){File.Delete(path);return;}
        if(edit.Operation=="create")
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            // CreateNew refuses a file that appeared after the existence check.
            using var stream=new FileStream(SourceAccess.Resolve(root,edit.Path),FileMode.CreateNew,FileAccess.Write,FileShare.None);
            var bytes=new UTF8Encoding(false).GetBytes(edit.Content);stream.Write(bytes);stream.Flush(true);
        }
        else File.WriteAllText(path,edit.Content,new UTF8Encoding(false));
    }
    public static void Restore(string root, Edit edit, byte[] original)
    {
        if(OriginalMatches(root,edit,original))return;
        if(!AfterMatches(root,edit))throw new InvalidOperationException("Source no longer matches this change: "+edit.Path);
        var path=SourceAccess.Resolve(root,edit.Path);
        if(edit.Operation=="create")File.Delete(path);
        else if(edit.Operation=="delete")
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            using var stream=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.None);
            stream.Write(original);stream.Flush(true);
        }
        else File.WriteAllBytes(path,original);
    }
}
