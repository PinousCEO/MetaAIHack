using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class DepthMacBuild
{
    public static void Build()
    {
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        new GameObject("Depth Application").AddComponent<DepthWorkbench>();
        Directory.CreateDirectory("Assets/Scenes");EditorSceneManager.SaveScene(scene,"Assets/Scenes/Depth.unity");
        PlayerSettings.companyName="Depth AI";PlayerSettings.productName="Depth AI";
        PlayerSettings.defaultScreenWidth=1680;PlayerSettings.defaultScreenHeight=1000;
        PlayerSettings.fullScreenMode=FullScreenMode.Windowed;PlayerSettings.runInBackground=true;
        var destination=Path.GetFullPath("../../artifacts/macos/Depth AI.app");
        Directory.CreateDirectory(Path.GetDirectoryName(destination));
        var result=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{"Assets/Scenes/Depth.unity"},locationPathName=destination,target=BuildTarget.StandaloneOSX,options=BuildOptions.None});
        if(result.summary.result!=BuildResult.Succeeded)throw new System.Exception("macOS build failed: "+result.summary.result);
    }
}
