namespace Depth;

public record WeightedDependency(string From,string To,string Kind,double Weight,string Evidence,int Sites);
public record ModuleBoundary(string FromModule,string ToModule,string Kind,double Weight,int Sites);
public record MathematicalModule(string Id,string[] EntityIds,double Volume,double InternalWeight,double CutWeight,double Conductance,string[][] Cycles);
public record ModuleMathematics(string ProjectId,string Revision,string Algorithm,double Resolution,double Modularity,
    MathematicalModule[] Modules,WeightedDependency[] Dependencies,ModuleBoundary[] Boundaries,string[] Limits);
public record RankedModule(string Id,double Score,int Rank);

/// <summary>Sparse typed dependency matrices, SCC constraints, modularity partition and personalized diffusion.</summary>
public static class ModuleMath
{
    static double Weight(Relation relation) => (relation.Kind switch {"calls"=>3,"references"=>2,"constructs"=>2,"inherits"=>1.5,"view-asset"=>1,"contains"=>.5,_=>.5})
        * (relation.Evidence.Kind switch {"static"=>1,"observed"=>1,"inferred"=>.25,_=>0});
    public static WeightedDependency[] Dependencies(Graph graph) => graph.Relations.Where(r=>r.From!=r.To&&Weight(r)>0)
        .GroupBy(r=>(From:r.From,To:r.To,Kind:r.Kind,Evidence:r.Evidence.Kind)).Select(g=>new WeightedDependency(g.Key.From,g.Key.To,g.Key.Kind,
            Weight(g.First())*(1+Math.Log(g.Count())),g.Key.Evidence,g.Count())).ToArray();

    public static ModuleMathematics Partition(Graph graph,int maxMembers=48,double resolution=1)
    {
        if(maxMembers is <2 or >256||!double.IsFinite(resolution)||resolution is <.1 or >4)throw new InvalidOperationException("Module size must be 2–256 and resolution 0.1–4.");
        var edges=Dependencies(graph);var ids=graph.Entities.Select(e=>e.Id).Order(StringComparer.Ordinal).ToArray();
        var components=Cycles(ids,edges.Where(e=>e.Kind=="calls").Select(e=>(e.From,e.To)));
        var owner=components.SelectMany((c,i)=>c.Select(id=>(id,i))).ToDictionary(x=>x.id,x=>x.i);
        var adjacency=Enumerable.Range(0,components.Length).Select(_=>new Dictionary<int,double>()).ToArray();
        void Add(int a,int b,double value)=>adjacency[a][b]=adjacency[a].GetValueOrDefault(b)+value;
        foreach(var edge in edges){if(!owner.TryGetValue(edge.From,out var a)||!owner.TryGetValue(edge.To,out var b))continue;Add(a,b,edge.Weight);Add(b,a,edge.Weight);}
        var degrees=adjacency.Select(a=>a.Values.Sum()).ToArray();double mass=degrees.Sum();
        var community=Enumerable.Range(0,components.Length).ToArray();var volumes=degrees.ToArray();var sizes=components.Select(c=>c.Length).ToArray();
        // Exact delta of Q = sum_c (internal_c / 2m - gamma * (volume_c / 2m)^2).
        if(mass>0)for(int pass=0;pass<30;pass++){
            bool moved=false;
            for(int node=0;node<components.Length;node++){
                int from=community[node],best=from;double gain=1e-10,k=degrees[node];
                var incident=new Dictionary<int,double>();foreach(var (neighbor,w) in adjacency[node])if(neighbor!=node){int c=community[neighbor];incident[c]=incident.GetValueOrDefault(c)+w;}
                foreach(int to in incident.Keys.Order()){
                    if(to==from||sizes[to]+components[node].Length>maxMembers)continue;
                    double delta=2*(incident[to]-incident.GetValueOrDefault(from))/mass-resolution*2*k*(volumes[to]-volumes[from]+k)/(mass*mass);
                    if(delta>gain){gain=delta;best=to;}
                }
                if(best==from)continue;community[node]=best;volumes[from]-=k;volumes[best]+=k;sizes[from]-=components[node].Length;sizes[best]+=components[node].Length;moved=true;
            }
            if(!moved)break;
        }
        var groups=components.Select((c,i)=>(c,label:community[i])).GroupBy(x=>x.label).Select(g=>g.SelectMany(x=>x.c).Order(StringComparer.Ordinal).ToArray()).ToArray();
        return Describe(graph,groups,edges,components,resolution);
    }
    public static ModuleMathematics Describe(Graph graph,string[][] groups,WeightedDependency[]? dependencies=null,string[][]? cycles=null,double resolution=1)
    {
        var all=groups.SelectMany(g=>g).ToArray();if(all.Length!=all.Distinct().Count()||!all.ToHashSet().SetEquals(graph.Entities.Select(e=>e.Id))||groups.Any(g=>g.Length==0))throw new InvalidOperationException("Every canonical entity must belong to exactly one module.");
        var edges=dependencies??Dependencies(graph);cycles??=Cycles(all,edges.Where(e=>e.Kind=="calls").Select(e=>(e.From,e.To)));
        var groupIds=groups.Select(g=>Wire.Id("module",graph.ProjectId+":math-v1:"+string.Join("|",g.Order(StringComparer.Ordinal)))).ToArray();
        var owner=groups.SelectMany((g,i)=>g.Select(id=>(id,i))).ToDictionary(x=>x.id,x=>x.i);
        if(cycles.Any(c=>c.Select(id=>owner[id]).Distinct().Count()>1))throw new InvalidOperationException("Mutually recursive source units cannot be split without a source refactoring.");
        var volume=new double[groups.Length];var inside=new double[groups.Length];var cut=new double[groups.Length];
        foreach(var edge in edges){int a=owner[edge.From],b=owner[edge.To];volume[a]+=edge.Weight;volume[b]+=edge.Weight;if(a==b)inside[a]+=2*edge.Weight;else{cut[a]+=edge.Weight;cut[b]+=edge.Weight;}}
        double mass=volume.Sum();double modularity=mass==0?0:Enumerable.Range(0,groups.Length).Sum(i=>inside[i]/mass-resolution*Math.Pow(volume[i]/mass,2));
        var modules=groups.Select((g,i)=>new MathematicalModule(groupIds[i],g,volume[i],inside[i]/2,cut[i],Math.Min(volume[i],mass-volume[i])<=0?0:cut[i]/Math.Min(volume[i],mass-volume[i]),cycles.Where(c=>c.Length>1&&owner[c[0]]==i).ToArray())).ToArray();
        var boundaries=edges.Where(e=>owner[e.From]!=owner[e.To]).GroupBy(e=>(From:groupIds[owner[e.From]],To:groupIds[owner[e.To]],e.Kind))
            .Select(g=>new ModuleBoundary(g.Key.From,g.Key.To,g.Key.Kind,g.Sum(e=>e.Weight),g.Sum(e=>e.Sites))).ToArray();
        return new(graph.ProjectId,graph.Revision,"typed weighted graph + call-SCC contraction + bounded greedy modularity; directed quotient P^T A_kind P",resolution,modularity,modules,edges,boundaries,
            ["Partition is a structural candidate, not proof of functional independence or behavior preservation.","Weights are explicit engineering priors, not learned probabilities. Dynamic/unresolved relations may be absent.","SCCs larger than the requested size stay intact. Greedy optimization has no global-optimum guarantee."]);
    }
    public static RankedModule[] Rank(ModuleMathematics model,string id,int count=12)
    {
        var ids=model.Modules.Select(m=>m.Id).Order(StringComparer.Ordinal).ToArray();if(!ids.Contains(id))throw new InvalidOperationException("Unknown canonical module.");
        var neighbors=ids.ToDictionary(i=>i,_=>new Dictionary<string,double>());
        foreach(var b in model.Boundaries){neighbors[b.FromModule][b.ToModule]=neighbors[b.FromModule].GetValueOrDefault(b.ToModule)+b.Weight;neighbors[b.ToModule][b.FromModule]=neighbors[b.ToModule].GetValueOrDefault(b.FromModule)+b.Weight;}
        var rank=ids.ToDictionary(i=>i,i=>i==id?1d:0d);
        for(int iteration=0;iteration<60;iteration++){
            var next=ids.ToDictionary(i=>i,i=>i==id?.2:0);foreach(var from in ids){double total=neighbors[from].Values.Sum();if(total==0)next[id]+=.8*rank[from];else foreach(var (to,w) in neighbors[from])next[to]+=.8*rank[from]*w/total;}
            double error=ids.Sum(i=>Math.Abs(next[i]-rank[i]));rank=next;if(error<1e-10)break;
        }
        return rank.OrderByDescending(p=>p.Value).ThenBy(p=>p.Key,StringComparer.Ordinal).Take(Math.Clamp(count,1,64)).Select((p,i)=>new RankedModule(p.Key,p.Value,i+1)).ToArray();
    }
    static string[][] Cycles(string[] ids,IEnumerable<(string From,string To)> edges)
    {
        var outgoing=ids.ToDictionary(i=>i,_=>new List<string>());var incoming=ids.ToDictionary(i=>i,_=>new List<string>());
        foreach(var (a,b) in edges)if(outgoing.ContainsKey(a)&&incoming.ContainsKey(b)){outgoing[a].Add(b);incoming[b].Add(a);}
        var visited=new HashSet<string>();var order=new List<string>();
        foreach(var id in ids.Order(StringComparer.Ordinal)){
            var stack=new Stack<(string Id,bool Exit)>();stack.Push((id,false));
            while(stack.TryPop(out var item)){if(item.Exit){order.Add(item.Id);continue;}if(!visited.Add(item.Id))continue;stack.Push((item.Id,true));foreach(var next in outgoing[item.Id].OrderDescending(StringComparer.Ordinal))if(!visited.Contains(next))stack.Push((next,false));}
        }
        visited.Clear();var result=new List<string[]>();
        foreach(var id in order.AsEnumerable().Reverse()){if(visited.Contains(id))continue;var group=new List<string>();var stack=new Stack<string>();stack.Push(id);while(stack.TryPop(out var node)){if(!visited.Add(node))continue;group.Add(node);foreach(var next in incoming[node])if(!visited.Contains(next))stack.Push(next);}result.Add(group.Order(StringComparer.Ordinal).ToArray());}
        return result.OrderBy(c=>c[0],StringComparer.Ordinal).ToArray();
    }
}
