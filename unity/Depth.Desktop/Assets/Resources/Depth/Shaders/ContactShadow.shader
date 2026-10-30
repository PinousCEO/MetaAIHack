Shader "Depth/ContactShadow" {SubShader {Tags {"Queue"="Transparent-10"} Pass {Blend SrcAlpha OneMinusSrcAlpha ZWrite Off Cull Off CGPROGRAM
#pragma vertex vert
#pragma fragment frag
#include "UnityCG.cginc"
struct v2f {float4 pos:SV_POSITION;float2 uv:TEXCOORD0;};
v2f vert(appdata_base v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.uv=v.texcoord.xy*2-1;return o;}
fixed4 frag(v2f i):SV_Target{return float4(.12,.20,.39,exp(-dot(i.uv,i.uv)*3.5)*.23);}
ENDCG }}}
