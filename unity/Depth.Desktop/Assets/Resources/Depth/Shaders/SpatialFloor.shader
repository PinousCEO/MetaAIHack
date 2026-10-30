Shader "Depth/SpatialFloor" {SubShader {Tags {"Queue"="Geometry"} Pass { CGPROGRAM
#pragma vertex vert
#pragma fragment frag
#include "UnityCG.cginc"
struct v2f{float4 pos:SV_POSITION;float3 world:TEXCOORD0;};
v2f vert(appdata_base v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.world=mul(unity_ObjectToWorld,v.vertex).xyz;return o;}
fixed4 frag(v2f i):SV_Target{float2 q=i.world.xz*.24;float2 a=abs(frac(q-.5)-.5)/max(fwidth(q),.001);float grid=1-saturate(min(a.x,a.y));float fade=exp(-abs(i.world.z)*.05);float light=exp(-dot(i.world.xz,i.world.xz)*.002);return float4(lerp(float3(.90,.925,.96),float3(.97,.98,1),light)+grid*.012*fade,1);}
ENDCG }}}
