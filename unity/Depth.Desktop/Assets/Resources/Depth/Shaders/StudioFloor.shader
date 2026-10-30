Shader "Depth/StudioFloor" {SubShader {Tags {"Queue"="Transparent-50"} Pass {Blend SrcAlpha OneMinusSrcAlpha ZWrite Off
 CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 struct v2f {float4 pos:SV_POSITION;float3 world:TEXCOORD0;};
 v2f vert(appdata_base v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.world=mul(unity_ObjectToWorld,v.vertex).xyz;return o;}
 fixed4 frag(v2f i):SV_Target{
 float light=exp(-pow((i.world.x+14)*.035,2)-pow((i.world.z-5)*.035,2));
 float contact=exp(-dot(i.world.xz*float2(.06,.05),i.world.xz*float2(.06,.05)))*.08;
 float seam=pow(saturate(1-abs(frac((i.world.z+5)*.055)-.5)*2),160)*.012;
 float fade=exp(-max(0,distance(_WorldSpaceCameraPos,i.world)-12)*.06);
 return float4(float3(.76,.80,.85)+light*.12-contact-seam,fade);
 }
 ENDCG
 }}}
