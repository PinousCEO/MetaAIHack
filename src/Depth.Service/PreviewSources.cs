using System.Text;
using System.Text.Json;
namespace Depth;

// Declared preview mappings are source evidence, not inferred execution traces.
// JSON token offsets preserve the actual line even when literal values repeat.
public static class PreviewSources
{
    public static string Id(string project,string key)=>Wire.Id("preview-element",project+":"+key);
    public static void Index(string root,string project,Dictionary<string,Entity> entities,List<Relation> relations,List<string> diagnostics)
    {
        const string file="depth.preview.json";var path=Path.Combine(root,file);if(!File.Exists(path))return;
        try {
            var text=File.ReadAllText(SourceAccess.Resolve(root,file));if(text.Length>100000)throw new InvalidOperationException("Preview descriptor too large.");
            var bytes=Encoding.UTF8.GetBytes(text);var hash=Wire.Hash(text);var locations=new Dictionary<string,Anchor>();
            var reader=new Utf8JsonReader(bytes);reader.Read();Read(ref reader,"",bytes,hash,locations);
            using var doc=JsonDocument.Parse(text);var json=doc.RootElement;
            string Value(JsonElement item,string name)=>item.TryGetProperty(name,out var value)?value.GetString()??"":"";
            string? Resolve(string source,string name)=>entities.Values.SingleOrDefault(e=>e.Name==name&&e.Anchors.Any(a=>a.Path==source))?.Id;
            var owner=Id(project,"view");var ownerAnchor=new Anchor(file,1,text.Count(c=>c=='\n')+1,hash);
            entities[owner]=new(owner,"Preview view","View","view-manifest","Declared preview layout",[ownerAnchor]);
            void Edge(string from,string to,string kind,Anchor anchor){relations.Add(new(Wire.Id("rel",from+to+kind),from,to,kind,new("static","declared-preview-adapter","Declared by preview source; not runtime observation"),anchor));}
            var entry=Resolve(Value(json,"entryPath"),Value(json,"entryName"));if(entry!=null)Edge(owner,entry,"view-action",ownerAnchor);
            var expression=Resolve(Value(json,"expressionPath"),Value(json,"expressionName"));
            var values=new Dictionary<string,string>();if(json.TryGetProperty("values",out var declared))foreach(var value in declared.EnumerateArray()){var id=Resolve(Value(value,"path"),Value(value,"entity"));if(id!=null)values[Value(value,"name")]=id;}
            string? Variable(string key)=>values.GetValueOrDefault(Value(json,key));
            void Add(string key,string pointer,string name,params string?[] dependencies){
                if(!locations.TryGetValue(pointer,out var anchor))return;
                var id=Id(project,key);entities[id]=new(id,name,"ViewElement","view-manifest",pointer,[anchor]);
                Edge(owner,id,"contains",anchor);
                Edge(id,owner,"view-owner",anchor);
                foreach(var dependency in dependencies.Where(d=>d!=null).Distinct())Edge(id,dependency!,"view-binding",anchor);
            }
            Add("title","/title","View title");Add("action","/action","Action control",entry);
            Add("subtotal","/subtotalVariable","Subtotal display",Variable("subtotalVariable"));
            Add("discount","/rateVariable","Discount display",Variable("rateVariable"),Variable("subtotalVariable"),expression);
            Add("total","/expressionName","Total display",expression,Variable("subtotalVariable"),Variable("rateVariable"));
            if(json.TryGetProperty("labels",out var labels))foreach(var label in labels.EnumerateObject())Add("label."+label.Name,"/labels/"+label.Name.Replace("~","~0").Replace("/","~1"),"View label: "+label.Name,
                label.Name=="subtotal"?Variable("subtotalVariable"):label.Name=="discount"?Variable("rateVariable"):label.Name=="total"?expression:null);
            if(json.TryGetProperty("products",out var products)){int i=0;foreach(var product in products.EnumerateArray()){
                string key="product."+i,pointer="/products/"+i;
                Add(key+".name",pointer+"/name","Product name #"+(i+1));Add(key+".detail",pointer+"/detail","Product detail #"+(i+1));
                var asset=Wire.Id("asset",project+Value(product,"image"));
                Add(key+".image",pointer+"/image","Product image #"+(i+1),entities.ContainsKey(asset)?asset:null);
                if(entry!=null&&entities.ContainsKey(asset)&&locations.TryGetValue(pointer+"/image",out var imageAnchor)&&!relations.Any(r=>r.From==entry&&r.To==asset&&r.Kind=="view-asset"))Edge(entry,asset,"view-asset",imageAnchor);
                Add(key+".price",pointer+"/priceEntity","Product price #"+(i+1),Resolve(Value(product,"pricePath"),Value(product,"priceEntity")));i++;
            }}
        }catch(Exception e)when(e is not OutOfMemoryException){diagnostics.Add("Preview source bindings unavailable: "+e.Message);}
    }
    static void Read(ref Utf8JsonReader reader,string pointer,byte[] bytes,string hash,Dictionary<string,Anchor> locations){
        if(reader.TokenType==JsonTokenType.StartObject){while(reader.Read()&&reader.TokenType!=JsonTokenType.EndObject){var name=reader.GetString()!;reader.Read();Read(ref reader,pointer+"/"+name.Replace("~","~0").Replace("/","~1"),bytes,hash,locations);}return;}
        if(reader.TokenType==JsonTokenType.StartArray){int index=0;while(reader.Read()&&reader.TokenType!=JsonTokenType.EndArray)Read(ref reader,pointer+"/"+index++,bytes,hash,locations);return;}
        int line=1;for(int i=0;i<reader.TokenStartIndex;i++)if(bytes[i]==10)line++;
        locations[pointer]=new("depth.preview.json",line,line,hash);
    }
}
