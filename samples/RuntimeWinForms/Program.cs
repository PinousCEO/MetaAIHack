using System;
using System.Drawing;
using System.Windows.Forms;

namespace RuntimeWinForms;
internal static class Program
{
    [STAThread] static void Main() { ApplicationConfiguration.Initialize(); Application.Run(new CounterWindow()); }
}
public class CounterWindow : Form
{
    readonly Label value;
    int count;
    public CounterWindow()
    {
        Name = "CounterWindow"; Text = "Depth runtime verification · actual WinForms app";
        ClientSize = new Size(640, 400); BackColor = Color.FromArgb(244, 240, 229);
        var title = new Label { Name = "Heading", Text = "A real Windows application", Font = new Font("Segoe UI", 21), AutoSize = true, Location = new Point(34, 32) };
        value = new Label { Name = "Count", Text = "Count: 0", Font = new Font("Segoe UI", 28), AutoSize = true, Location = new Point(34, 112) };
        var button = new Button { Name = "Increment", Text = "Add one", Location = new Point(36, 205), Size = new Size(180, 48) };
        button.Click += Increment;
        var input = new TextBox { Name = "Note", Text = "Edit this text in the live preview", Location = new Point(36, 285), Width = 450 };
        Controls.AddRange(new Control[] { title, value, button, input });
        if (Environment.GetEnvironmentVariable("DEPTH_RUNTIME_TEST") == "1") input.TextChanged += (_, _) => SaveTestState(input.Text);
        if (Environment.GetEnvironmentVariable("DEPTH_RUNTIME_TEST") == "1") { var timer = new System.Windows.Forms.Timer { Interval = 30000 }; timer.Tick += (_, _) => { timer.Stop(); Close(); }; timer.Start(); }
    }
    void Increment(object? sender, EventArgs args)
    {
        count++;
        value.Text = "Count: " + count;
        SaveTestState(((TextBox)Controls["Note"]!).Text);
    }
    void SaveTestState(string text)
    {
        if (Environment.GetEnvironmentVariable("DEPTH_RUNTIME_TEST") == "1")
            System.IO.File.WriteAllText(".depth/test-state.json", System.Text.Json.JsonSerializer.Serialize(new { count, text }));
    }
}
