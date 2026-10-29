using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class DepthBuild
{
    [MenuItem("Depth/Build Windows")]
    public static void Windows()
    {
        Directory.CreateDirectory("Assets/Resources");
        if (AssetDatabase.LoadAssetAtPath<Material>("Assets/Resources/DepthGlow.mat") == null)
            AssetDatabase.CreateAsset(new Material(Shader.Find("Unlit/Color")), "Assets/Resources/DepthGlow.mat");
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        new GameObject("Depth Application").AddComponent<DepthWorkbench>();
        Directory.CreateDirectory("Assets/Scenes");
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/Depth.unity");
        PlayerSettings.companyName = "Depth AI";
        PlayerSettings.productName = "Depth AI";
        PlayerSettings.defaultScreenWidth = 1680;
        PlayerSettings.defaultScreenHeight = 1000;
        PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
        PlayerSettings.runInBackground = true;
        var destination = Path.GetFullPath("../../artifacts/windows/Depth AI.exe");
        Directory.CreateDirectory(Path.GetDirectoryName(destination));
        var sample = Path.GetFullPath("../../samples/Checkout");
        var outputSample = Path.Combine(Path.GetDirectoryName(destination), "sample");
        foreach (var file in Directory.GetFiles(sample, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(sample, file);
            if (relative.StartsWith("obj" + Path.DirectorySeparatorChar) || relative.StartsWith("bin" + Path.DirectorySeparatorChar)) continue;
            var target = Path.Combine(outputSample, relative); Directory.CreateDirectory(Path.GetDirectoryName(target)); File.Copy(file, target, true);
        }
        var result = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] { "Assets/Scenes/Depth.unity" },
            locationPathName = destination, target = BuildTarget.StandaloneWindows64, options = BuildOptions.None });
        if (result.summary.result != BuildResult.Succeeded) throw new System.Exception("Windows build failed: " + result.summary.result);
    }
}
