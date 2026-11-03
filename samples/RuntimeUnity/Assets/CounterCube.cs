using UnityEngine;

// A separate runnable test project. Depth AI itself remains an Electron app.
public sealed class CounterCube : MonoBehaviour
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
    static void BuildScene()
    {
        var camera = new GameObject("Preview camera").AddComponent<Camera>();
        camera.tag = "MainCamera";
        camera.transform.position = new Vector3(0, 0, -5);
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = new Color(.09f, .13f, .2f);
        var light = new GameObject("Preview light").AddComponent<Light>();
        light.type = LightType.Directional;
        light.transform.rotation = Quaternion.Euler(25, -30, 0);
        var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
        cube.name = "Actual rotating cube";
        cube.AddComponent<CounterCube>();
    }
    void Update() { transform.Rotate(13 * Time.deltaTime, 25 * Time.deltaTime, 0); }
}
