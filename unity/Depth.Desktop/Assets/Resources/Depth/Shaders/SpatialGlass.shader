Shader "Depth/SpatialGlass" {
 Properties { _Color("Tint",Color)=(.6,.8,1,.28) }
 SubShader { Tags {"Queue"="Transparent" "RenderType"="Transparent"} GrabPass {"_DepthGlassScene"}
 Pass { Blend SrcAlpha OneMinusSrcAlpha ZWrite Off Cull Back
 CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 sampler2D _DepthGlassScene; float4 _Color;
 struct v2f {float4 pos:SV_POSITION;float3 normal:TEXCOORD0;float3 world:TEXCOORD1;float4 grab:TEXCOORD2;};
 v2f vert(appdata_base v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.normal=UnityObjectToWorldNormal(v.normal);o.world=mul(unity_ObjectToWorld,v.vertex).xyz;o.grab=ComputeGrabScreenPos(o.pos);return o;}
 fixed4 frag(v2f i):SV_Target {
 float3 n=normalize(i.normal),v=normalize(_WorldSpaceCameraPos-i.world);float f=pow(1-saturate(dot(n,v)),3);
 float4 g=i.grab;g.xy+=n.xy*.012*g.w;float3 scene=tex2Dproj(_DepthGlassScene,UNITY_PROJ_COORD(g)).rgb;
 float spec=pow(saturate(dot(reflect(-normalize(float3(-.5,1,-.8)),n),v)),32);
 float ribbon=pow(saturate(1-abs(dot(n,normalize(float3(.3,.9,-.4))))),18);
 float edge=pow(1-saturate(dot(n,v)),1.5);
 float band=pow(saturate(dot(reflect(-v,n),normalize(float3(-.6,.8,-.4)))),24);
 float3 c=lerp(scene,_Color.rgb,.5+edge*.22)+spec*.65+band*.4;
 c=lerp(c,float3(.20,.38,.66),edge*.22);
 return float4(c,saturate(_Color.a+f*.3+spec*.25));
 }
 ENDCG
 } }
}
