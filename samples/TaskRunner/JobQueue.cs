using System.Collections.Generic;

// Keeps pending jobs in arrival order. This queue is not a concurrent scheduler.
public sealed class JobQueue
{
    private readonly Queue<string> pending = new();
    public void Add(string item) => pending.Enqueue(item);
    // Dequeue throws when empty; callers must check Count before taking a job.
    public string Next() => pending.Dequeue();
    public int Count => pending.Count;
}
