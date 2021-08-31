Shader "Toon/Lit Swaying Interactive" {
    Properties {
        _Color ("Main Color", Color) = (0.5,0.5,0.5,1)
        _MainTex ("Base (RGB)", 2D) = "white" {}
        _Ramp ("Toon Ramp (RGB)", 2D) = "gray" {}
        _Speed ("MoveSpeed", Range(20,50)) = 25 // speed of the swaying
        _Rigidness("Rigidness", Range(1,50)) = 25 // lower makes it look more "liquid" higher makes it look rigid
        _SwayMax("Sway Max", Range(0, 0.1)) = .005 // how far the swaying goes
        _YOffset("Y offset", float) = 0.0// y offset, below this is no animation
        _MaxWidth("Max Displacement Width", Range(0, 2)) = 0.1 // width of the line around the dissolve 
		_Radius("Radius", Range(0,5)) = 1 // width of the line around the dissolve 
    }
 
    SubShader {
        Tags { "RenderType"="Opaque" "DisableBatching" = "True" }// disable batching lets us keep object space
        LOD 200
        Blend SrcAlpha OneMinusSrcAlpha
 
       
CGPROGRAM
#pragma surface surf ToonRamp vertex:vert addshadow keepalpha // addshadow applies shadow after vertex animation
 
sampler2D _Ramp;
 
// custom lighting function that uses a texture ramp based
// on angle between light direction and normal
#pragma lighting ToonRamp exclude_path:prepass
inline half4 LightingToonRamp (SurfaceOutput s, half3 lightDir, half atten)
{
    #ifndef USING_DIRECTIONAL_LIGHT
    lightDir = normalize(lightDir);
    #endif
   
    half d = dot (s.Normal, lightDir)*0.5 + 0.5;
    half3 ramp = tex2D (_Ramp, float2(d,d)).rgb;
   
    half4 c;
    c.rgb = s.Albedo * _LightColor0.rgb * ramp * (atten * 2);
    c.a = s.Alpha;
    return c;
}
 
sampler2D _MainTex;
float4 _Color;
float _Radius;
 
float _Speed;
float _SwayMax;
float _YOffset;
float _Rigidness;
float _MaxWidth;
 
uniform float3 _Positions[100];
uniform float _PositionArray;
 
struct Input {
    float2 uv_MainTex : TEXCOORD0;
};
void vert(inout appdata_full v)//
{
    // basic swaying movement
   float3 wpos = mul(unity_ObjectToWorld, v.vertex).xyz;// world position
   float x = sin(wpos.x / _Rigidness + (_Time.x * _Speed)) *(v.vertex.y - _YOffset) * 5;// x axis movements
   float z = sin(wpos.z / _Rigidness + (_Time.x * _Speed)) *(v.vertex.y - _YOffset) * 5;// z axis movements
   v.vertex.x += (step(0,v.vertex.y - _YOffset) * x * _SwayMax);// apply the movement if the vertex's y above the YOffset
   v.vertex.z += (step(0,v.vertex.y - _YOffset) * z * _SwayMax);
 
   // interaction radius movement for every position in array
   for  (int i = 0; i < _PositionArray; i++){
        float3 dis =  distance(_Positions[i], wpos); // distance for radius
        float3 radius = 1-  saturate(dis /_Radius); // in world radius based on objects interaction radius
        float3 sphereDisp = wpos - _Positions[i]; // position comparison
        sphereDisp *= radius; // position multiplied by radius for falloff
        v.vertex.xz += clamp(sphereDisp.xz * step(_YOffset, v.vertex.y), -_MaxWidth,_MaxWidth);// vertex movement based on falloff and clamped
    }
}
 
void surf (Input IN, inout SurfaceOutput o) {
    half4 c = tex2D(_MainTex, IN.uv_MainTex) * _Color;
    o.Albedo = c.rgb;
    o.Alpha = c.a;
}
ENDCG
 
    }
 
    Fallback "Diffuse"
}