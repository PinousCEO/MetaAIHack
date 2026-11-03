using System;

public static class Program
{
    public static int Main()
    {
        if (Pricing.Total(2, 100) != 200) return 1;
        var queue = new JobQueue();
        queue.Add("A"); queue.Add("B");
        if (queue.Next() != "A" || queue.Next() != "B" || queue.Count != 0) return 2;
        var rewards = typeof(Program).Assembly.GetType("Rewards");
        if (rewards != null && (int)rewards.GetMethod("Points")!.Invoke(null, new object[] { 2, 100 })! != 2) return 3;
        Console.WriteLine("Pricing and FIFO checks passed.");
        return 0;
    }
}

public static class Pricing
{
    public static int Total(int count, int cents) => count * cents;
}
