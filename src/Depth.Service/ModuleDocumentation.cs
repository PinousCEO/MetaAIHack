using System.Text.Json;
using System.Text.Json.Nodes;

namespace Depth;

public record DecisionEvidence(string EntityId,string Quote);
public record DesignDecision(string Concept,string Summary,string Definition,string Mechanism,string WhyHere,string Example,
    string[] Alternatives,string[] Tradeoffs,DecisionEvidence[] Evidence);
public record ModuleDocumentation(int Version,string CreationReason,DesignDecision[] Decisions);
public record ExplanationRequest(string Id,string ProjectId,string Revision,string Level="beginner");
public record ExplanationSection(string Title,string Kind,string[] Paragraphs,DecisionEvidence[] Evidence);
public record GenerationReason(string ChangeId,string Reason,string Model,string[] Paths,string Status,string Basis);
public record ModuleExplanationView(string Id,string ProjectId,string Revision,string Fingerprint,string Level,string Status,
    string Provider,string Model,string Purpose,string CreationReason,string ReasonBasis,ExplanationSection[] Sections,
    GenerationReason[] GenerationReasons,string Scope);

/// <summary>One source-bound design record; reading level changes presentation, never the underlying claims.</summary>
public static class ModuleDocumentationFormat
{
    public const int Version=2;
    public const string ReasonBasis="inferred-from-source";
    // Budget actual Unicode characters, not six-character JSON escapes for non-ASCII text.
    static readonly JsonSerializerOptions CountJson=new(Wire.CompactJson){Encoder=System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping};
    public static int CharacterCount(ModuleExplanation note)=>JsonSerializer.Serialize(note,CountJson).Length;
    public const string Prompt="""
        Also write documentation version 2 in English. creationReason explains what problem this module appears to solve;
        original author intent is unknown unless explicitly recorded. This is a source-based design rationale, not private reasoning.
        decisions contains 0–6 meaningful choices actually visible in the supplied SOURCE excerpts (data structures, algorithms,
        patterns, interfaces). Do not invent a Queue or any other mechanism from a name alone. Empty decisions is correct for
        simple assets or when the relevant source is omitted; explain the limit in assumptions.
        Each decision has: concept (technical name), summary (a concise expert-facing choice + reason), definition (explain jargon
        from first principles for a complete beginner), mechanism (how it works here), whyHere (connect it to this module's actual
        problem, qualify inferred intent), example (a concrete small illustrative walkthrough, explicitly not an executed test),
        alternatives (when a different choice would fit), tradeoffs (limitations and conditions, never unconditional guarantees),
        evidence (1–4 exact entityId + quote pairs copied from supplied SOURCE excerpts, each quote 4–240 characters).
        For an actual Queue, explain FIFO/first-in-first-out, enqueue/dequeue and a short A/B/C ordering example, why arrival order
        matters here, and concurrency/bounds only as supported or as explicit assumptions. Do not confuse FIFO with completion
        ordering in parallel work. Do not copy this example into modules without a queue. Use more teaching detail for unfamiliar
        mechanisms but keep simple modules brief. All reading levels will be rendered from these same structured facts.
        Prefer 1–3 essential decisions rather than repeating the same concept for each member. Keep definitions and mechanisms
        to 1–3 complete sentences and examples to a short walkthrough. Reuse these facts across levels instead of writing
        separate beginner/intermediate/expert documents. Aim for at most 12000 characters for the complete JSON response.
        Write polished, complete English sentences. Keep source identifiers, code snippets and standard English technical
        terms exact, but do not mix unrelated Japanese/Chinese prose fragments into English explanations. Before returning,
        check every teaching example for readable English, correct FIFO ordering, and agreement with its quoted source.
        """;

    public static void Validate(ModuleDocumentation? document,string[] members,IReadOnlyDictionary<string,string> excerpts)
    {
        if(document==null||document.Version!=Version||string.IsNullOrWhiteSpace(document.CreationReason)||document.Decisions==null)
            throw new InvalidOperationException("Meta omitted the versioned creation reason or design decisions.");
        if(document.CreationReason.Length>2400||document.Decisions.Length>6)throw new InvalidOperationException("Module design documentation exceeds its budget.");
        foreach(var choice in document.Decisions){
            if(choice==null||new[]{choice.Concept,choice.Summary,choice.Definition,choice.Mechanism,choice.WhyHere,choice.Example}.Any(string.IsNullOrWhiteSpace)||
                choice.Alternatives==null||choice.Tradeoffs==null||choice.Evidence==null||choice.Evidence.Length is <1 or >4)
                throw new InvalidOperationException("A design choice needs an explanation, example, limitations and source evidence.");
            if(choice.Alternatives.Concat(choice.Tradeoffs).Any(string.IsNullOrWhiteSpace))throw new InvalidOperationException("Empty design alternatives or tradeoffs are not allowed.");
            foreach(var evidence in choice.Evidence)
                if(evidence==null||!members.Contains(evidence.EntityId)||evidence.Quote==null||evidence.Quote.Trim().Length is <4 or >240||
                    !excerpts.TryGetValue(evidence.EntityId,out var source)||!source.Contains(evidence.Quote,StringComparison.Ordinal))
                    throw new InvalidOperationException("Design evidence must quote the supplied source of an entity in this module.");
        }
    }

    public static void ValidateLevel(string level)
    {
        if(level is not ("beginner" or "intermediate" or "expert"))throw new InvalidOperationException("Choose beginner, intermediate or expert explanation level.");
    }
    public static ModuleExplanationView Present(ModuleContract contract,string level,GenerationReason[] reasons)
    {
        ValidateLevel(level);
        var note=contract.Explanation;var document=note?.Documentation;var sections=new List<ExplanationSection>();
        if(document?.Version==Version)foreach(var decision in document.Decisions){
            var content=new List<string>();
            if(level=="expert")content.Add(decision.Summary);
            else{
                if(level=="beginner")content.Add("Concept: "+decision.Definition);
                content.Add("Mechanism: "+decision.Mechanism);content.Add("Why here (source-based interpretation): "+decision.WhyHere);
                if(level=="beginner")content.Add("Illustrative example, not an executed test: "+decision.Example);
            }
            // Conditions and alternatives remain accessible even in the short explanation.
            content.AddRange(decision.Alternatives.Select(v=>"Alternative: "+v));content.AddRange(decision.Tradeoffs.Select(v=>"Tradeoff: "+v));
            sections.Add(new(decision.Concept,"design-decision",content.ToArray(),decision.Evidence));
        }
        if(note!=null){
            void Add(string title,string kind,string[] values){if(values.Length>0)sections.Add(new(title,kind,values,[]));}
            Add("Responsibilities","responsibilities",note.Responsibilities);Add("Inputs","inputs",note.Inputs);Add("Outputs","outputs",note.Outputs);
            Add("Side effects","side-effects",note.SideEffects);Add("Invariants","invariants",note.Invariants);Add("Assumptions and unknowns","assumptions",note.Assumptions);
        }
        return new(contract.Id,contract.ProjectId,contract.Revision,contract.Fingerprint,level,contract.Status,contract.Provider,contract.Model,
            note?.Purpose??"",document?.CreationReason??"",ReasonBasis,sections.ToArray(),reasons,
            "Source-grounded AI interpretation with verified quotations. This does not prove author intent, semantic accuracy or runtime behavior. Recorded generation reasons are shown separately. Stale explanations need reanalysis.");
    }

    // Keep tutorial prose out of the default AI context. Full educational views are retrieved explicitly.
    public static object Compact(ModuleContract m)=>new{schema="depth-module-contract/v2",m.Id,m.ProjectId,m.Revision,m.Fingerprint,m.EntityIds,m.Provides,m.Requires,
        explanation=m.Explanation==null?null:new{m.Explanation.Name,m.Explanation.Purpose,m.Explanation.Responsibilities,m.Explanation.Inputs,m.Explanation.Outputs,
            m.Explanation.SideEffects,m.Explanation.Invariants,m.Explanation.Assumptions,m.Explanation.EvidenceIds,
            creationReason=m.Explanation.Documentation?.CreationReason,reasonBasis=ReasonBasis,
            decisions=m.Explanation.Documentation?.Decisions.Select(d=>new{d.Concept,d.Summary,d.WhyHere,d.Alternatives,d.Tradeoffs,d.Evidence})},
        m.Status,m.Provider,m.Model,m.Mathematics};

    public static JsonNode Schema=>JsonNode.Parse("""
    {"type":"object","additionalProperties":false,"required":["version","creationReason","decisions"],"properties":{
      "version":{"type":"integer","enum":[2]},"creationReason":{"type":"string"},
      "decisions":{"type":"array","items":{"type":"object","additionalProperties":false,
        "required":["concept","summary","definition","mechanism","whyHere","example","alternatives","tradeoffs","evidence"],"properties":{
          "concept":{"type":"string"},"summary":{"type":"string"},"definition":{"type":"string"},"mechanism":{"type":"string"},
          "whyHere":{"type":"string"},"example":{"type":"string"},"alternatives":{"type":"array","items":{"type":"string"}},
          "tradeoffs":{"type":"array","items":{"type":"string"}},"evidence":{"type":"array","items":{"type":"object","additionalProperties":false,
            "required":["entityId","quote"],"properties":{"entityId":{"type":"string"},"quote":{"type":"string"}}}}
        }}}}}
    """)!;
}
