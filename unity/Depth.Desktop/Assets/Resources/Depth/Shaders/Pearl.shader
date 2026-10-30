Shader "Depth/Pearl" {Properties {_Color("Color",Color)=(.95,.97,1,1)} SubShader {Tags {"Queue"="Geometry"} Pass {CGPROGRAM
#pragma vertex vert
#pragma fragment frag
#include "UnityCG.cginc"
float4 _Color;
struct v2f{float4 pos:SV_POSITION;float3 n:TEXCOORD0;float3 p:TEXCOORD1;};
v2f vert(appdata_base v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.n=UnityObjectToWorldNormal(v.normal);o.p=mul(unity_ObjectToWorld,v.vertex).xyz;return o;}
fixed4 frag(v2f i):SV_Target{float3 n=normalize(i.n),v=normalize(_WorldSpaceCameraPos-i.p),l=normalize(float3(-.5,1,-.8));float light=.94+.06*saturate(dot(n,l));float spec=pow(saturate(dot(reflect(-l,n),v)),48)*.12;return float4(_Color.rgb*light+spec,1);}
ENDCG }}}
