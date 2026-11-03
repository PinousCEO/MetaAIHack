using System.Text.Json;
namespace Depth;

public static class PreviewSourcesTest
{
    public static void Run(string root,Action<bool,string> check)
    {
        Directory.CreateDirectory(root);
        File.WriteAllText(Path.Combine(root,"Pricing.cs"),"class Pricing { double Rate=20, Subtotal=120, FirstPrice=30, SecondPrice=90; double Calculate(double subtotal) => subtotal*(1-Rate/100); double Apply()=>Calculate(Subtotal); void Unused(){} }");
        File.WriteAllText(Path.Combine(root,"image.png"),"Asset identity fixture; not decoded by this source-index test.");
        var manifest="""
        {
          "title":"Repeated",
          "action":"Apply",
          "entryPath":"Pricing.cs","entryName":"Apply",
          "expressionPath":"Pricing.cs","expressionName":"Calculate",
          "subtotalVariable":"subtotal","rateVariable":"Rate",
          "labels":{"subtotal":"Subtotal","discount":"Discount","total":"Total"},
          "values":[{"name":"subtotal","path":"Pricing.cs","entity":"Subtotal"},{"name":"Rate","path":"Pricing.cs","entity":"Rate"}],
          "products":[
            {"name":"Repeated","detail":"First detail","image":"image.png","pricePath":"Pricing.cs","priceEntity":"FirstPrice"},
            {"name":"Repeated","detail":"Second detail","image":"image.png","pricePath":"Pricing.cs","priceEntity":"SecondPrice"}
          ]
        }
        """;
        var path=Path.Combine(root,"depth.preview.json");File.WriteAllText(path,manifest);
        var ws=new Workspace(Path.Combine(root,".state"));var graph=ws.Import(root);var view=ws.Index.Build(graph);
        string Id(string key)=>view.Preview!.Bindings.Single(b=>b.Key==key).Id;
        string Named(string name)=>graph.Entities.Single(e=>e.Name==name).Id;
        var first=graph.Entities.Single(e=>e.Id==Id("product.0.name"));var second=graph.Entities.Single(e=>e.Id==Id("product.1.name"));
        var lines=manifest.Split('\n');
        check(first.Anchors[0].StartLine!=second.Anchors[0].StartLine&&lines[first.Anchors[0].StartLine-1].Contains("First detail")&&lines[second.Anchors[0].StartLine-1].Contains("Second detail"),"Repeated preview text retains distinct identities and exact JSON token source lines");
        check(view.Preview!.Bindings.All(b=>graph.Entities.Any(e=>e.Id==b.Id))&&graph.Relations.Any(r=>r.Kind=="view-asset"),"Preview identities and image usage are canonical graph evidence shared with AI tools");
        var wholeView=ws.Index.Compose(graph,view.Preview.ViewId);
        check(view.Preview.Bindings.All(b=>wholeView.MemberIds.Contains(b.Id)),"Selecting the declared view includes all of its text, controls and images");
        check(JsonSerializer.Serialize(ws.Source(first.Id),Wire.Json).Contains("First detail"),"Selecting preview text can retrieve the real descriptor source");
        var price=ws.Index.Compose(graph,Id("product.0.price"));
        check(price.MemberIds.Contains(Named("FirstPrice"))&&!price.MemberIds.Contains(Named("SecondPrice")),"Product price links its exact producer without pulling in an unrelated product price");
        var total=ws.Index.Compose(graph,Id("total"));
        check(new[]{Named("Calculate"),Named("Rate"),Named("Subtotal")}.All(total.MemberIds.Contains),"Total display traces expression and input fields");
        var asset=graph.Entities.Single(e=>e.Kind=="Image");var image=ws.Index.Compose(graph,asset.Id);
        check(new[]{Id("product.0.image"),Id("product.1.image"),Named("Apply"),view.Preview.ViewId}.All(image.MemberIds.Contains)&&!image.MemberIds.Contains(Named("Unused")),"Image selection includes both declared users and their feature dependencies, excluding unrelated code");
        check(image.Relations.Where(r=>r.Kind.StartsWith("view-")).All(r=>r.Evidence.Method=="declared-preview-adapter"),"Declared preview usage is not presented as observed runtime behavior");
        File.WriteAllText(path,manifest.Replace("First detail","Updated detail"));var refreshed=ws.Refresh();var updated=ws.Index.Build(refreshed);
        check(refreshed.Revision!=graph.Revision&&updated.Preview!.Bindings.Single(b=>b.Key=="product.0.name").Id==first.Id&&refreshed.Entities.Single(e=>e.Id==first.Id).Anchors[0].ContentHash!=first.Anchors[0].ContentHash,"Preview edits update revision and evidence hashes while preserving element identity");
    }
}
