using System;

namespace DepthClient
{
    [Serializable] public class Anchor { public string path, contentHash; public int startLine, endLine; }
    [Serializable] public class Evidence { public string kind, method, detail; }
    [Serializable] public class Entity { public string id, name, kind, language, qualifiedName; public Anchor[] anchors; }
    [Serializable] public class Relation { public string id, from, to, kind; public Evidence evidence; public Anchor site; }
    [Serializable] public class Module { public string id, name, purpose; public string[] entityIds; public Evidence evidence; }
    [Serializable] public class SourceFile { public string path, hash, language; }
    [Serializable] public class Graph { public string schemaVersion, projectId, root, revision; public Entity[] entities; public Relation[] relations; public Module[] modules; public SourceFile[] files; public string[] diagnostics; }
    [Serializable] public class Edit { public string path, expectedHash, content; }
    [Serializable] public class SourceView { public Anchor anchor; public string content; public int startLine; }
    [Serializable] public class SourceResponse { public SourceView[] sources; }
    [Serializable] public class ModuleDraft { public string name, purpose; public string[] entityIds; }
    [Serializable] public class Proposal { public string id, revision, reason; public Edit[] edits; public ModuleDraft[] modules; }
    [Serializable] public class ImportRequest { public string path; }
    [Serializable] public class PromptRequest { public string prompt,revision; public string[] moduleIds; }
    [Serializable] public class ApplyRequest { public string id; public bool approved; }
    [Serializable] public class RuntimeSelection { public string projectId, revision, sessionId, objectId, name; public string[] sourcePaths; }
    [Serializable] public class NumericProperty { public string key, label, value, path, expectedHash; public bool editable; }
    [Serializable] public class ModuleCard { public string id, name, kind, group, purpose, creationReason, rationale, noteOrigin, noteStatus; public string[] entityIds; public Anchor[] anchors; public NumericProperty[] properties; }
    [Serializable] public class PreviewProduct { public string name, detail, image, assetId; public double price; }
    [Serializable] public class BehaviorPreview { public string title, action, entryId, propertyId, expression, evidence; public double subtotal, rate, total; public PreviewProduct[] products; }
    [Serializable] public class WorkspaceView { public string root, revision; public ModuleCard[] cards; public Module[] groups; public Relation[] relations; public BehaviorPreview preview; public int sourceCount; public string[] diagnostics; }
    [Serializable] public class Composition { public string rootId, revision, scope; public string[] memberIds; public Relation[] relations; public int totalRelated; }
    [Serializable] public class PropertyRequest { public string id, value, revision; }
    [Serializable] public class ProposalChange { public string path, before, after; }
    [Serializable] public class ProposalPreview { public Proposal proposal; public ProposalChange[] changes; public ChangeAssessment assessment; }
    [Serializable] public class ImpactItem { public string id,name,kind,changeId; public int hops; public Anchor[] anchors; public Relation[] path; }
    [Serializable] public class ImpactReport { public string revision,scope; public string[] rootIds; public ImpactItem[] items; public int directUsers; public bool truncated; }
    [Serializable] public class ValidationCheck { public string name,status,detail; }
    [Serializable] public class ChangeAssessment { public ImpactReport impact; public string[] changedIds; public string mapping; public ValidationCheck[] checks; public bool canApply; }
    [Serializable] public class ContextRequest { public string id,revision; }
    [Serializable] public class ContextPacket { public string packetId,revision,rootId,content; public int characters,omittedModules; public string[] includedIds; public bool truncated; }
    [Serializable] public class PendingProposals { public Proposal[] proposals; }
    [Serializable] public class ActivityItem { public string tool, moduleId, detail, at; }
    [Serializable] public class ActivityFeed { public ActivityItem[] items; }
    [Serializable] public class AgentRequest { public string prompt, apiKey, model, revision; public string[] moduleIds; }
    [Serializable] public class AgentReply { public string message; public Proposal proposal; public ActivityItem[] activity; }
    [Serializable] public class ToolRequest { public string name, argumentsJson; }
    [Serializable] public class SourceRequest { public string id; public bool wholeFile; }
    [Serializable] public class ConnectionInfo { public string endpoint, token; }
}
