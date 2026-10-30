Shader "Depth/SpatialStudio" { SubShader {Tags {"Queue"="Background"} Pass {ZWrite Off Cull Off
 CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 struct v2f{float4 pos:SV_POSITION;float2 uv:TEXCOORD0;};
 v2f vert(appdata_base v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.uv=v.texcoord.xy;return o;}
 fixed4 frag(v2f i):SV_Target {
 float2 p=i.uv;
 float window=exp(-pow((p.x-.07)*3,2)-pow((p.y-.65)*1.7,2));
 float horizon=smoothstep(.16,.22,p.y);float floor=exp(-pow((p.y-.15)*5,2));
 float3 c=lerp(float3(.73,.79,.85),float3(.87,.90,.94),horizon);
 c+=window*.12+floor*.04;
 float seam=exp(-pow((p.x-.82)*350,2))*.025+exp(-pow((p.x-.31)*350,2))*.018;
 return float4(c-seam,1);
 }
 ENDCG
 }}}
