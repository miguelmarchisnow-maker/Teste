// Vertex
struct GlobalUniforms {
    uProjectionMatrix: mat3x3<f32>,
    uWorldTransformMatrix: mat3x3<f32>,
    uWorldColorAlpha: vec4<f32>,
    uResolution: vec2<f32>,
};

struct LocalUniforms {
    uTransformMatrix: mat3x3<f32>,
    uColor: vec4<f32>,
    uRound: f32,
};

@group(0) @binding(0) var<uniform> globalUniforms : GlobalUniforms;
@group(1) @binding(0) var<uniform> localUniforms : LocalUniforms;

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) vUV: vec2<f32>,
};

@vertex
fn mainVertex(
    @location(0) aPosition: vec2<f32>,
    @location(1) aUV: vec2<f32>,
) -> VSOutput {
    var output: VSOutput;
    output.vUV = aUV;
    let mvp = globalUniforms.uProjectionMatrix * localUniforms.uTransformMatrix;
    let pos = mvp * vec3<f32>(aPosition, 1.0);
    output.position = vec4<f32>(pos.xy, 0.0, 1.0);
    return output;
}

// Fragment
struct PlanetUniforms {
    uPixels: f32,
    uTime: f32,
    uSeed: f32,
    uRotation: f32,
    uLightOrigin: vec2<f32>,
    uTimeSpeed: f32,
    uDitherSize: f32,
    uLightBorder1: f32,
    uLightBorder2: f32,
    uSize: f32,
    uOctaves: i32,
    uPlanetType: i32,
    uRiverCutoff: f32,
    uLandCutoff: f32,
    uCloudCover: f32,
    uStretch: f32,
    uCloudCurve: f32,
    uColors0: vec4<f32>,
    uColors1: vec4<f32>,
    uColors2: vec4<f32>,
    uColors3: vec4<f32>,
    uColors4: vec4<f32>,
    uColors5: vec4<f32>,
    uTiles: f32,
    uCloudAlpha: f32,
};

@group(2) @binding(0) var<uniform> pu : PlanetUniforms;

fn rand(coord_in: vec2<f32>) -> f32 {
    var m: vec2<f32>;
    if (pu.uPlanetType == 0 || pu.uPlanetType == 1) {
        m = vec2<f32>(2.0, 1.0) * floor(pu.uSize + 0.5);
    } else {
        m = vec2<f32>(1.0, 1.0) * floor(pu.uSize + 0.5);
    }
    let c = coord_in % m;
    return fract(sin(dot(c, vec2<f32>(12.9898, 78.233))) * 15.5453 * pu.uSeed);
}

fn noise(coord: vec2<f32>) -> f32 {
    let i = floor(coord);
    let f = fract(coord);
    let a = rand(i);
    let b = rand(i + vec2<f32>(1.0, 0.0));
    let c = rand(i + vec2<f32>(0.0, 1.0));
    let d = rand(i + vec2<f32>(1.0, 1.0));
    let cubic = f * f * (3.0 - 2.0 * f);
    return mix(a, b, cubic.x) + (c - a) * cubic.y * (1.0 - cubic.x) + (d - b) * cubic.x * cubic.y;
}

fn fbm(coord_in: vec2<f32>) -> f32 {
    var value = 0.0;
    var scale = 0.5;
    var coord = coord_in;
    for (var i = 0; i < 6; i++) {
        if (i >= pu.uOctaves) { break; }
        value += noise(coord) * scale;
        coord *= 2.0;
        scale *= 0.5;
    }
    return value;
}

fn spherify(uv: vec2<f32>) -> vec2<f32> {
    let centered = uv * 2.0 - 1.0;
    let z = sqrt(1.0 - dot(centered, centered));
    let sphere = centered / (z + 1.0);
    return sphere * 0.5 + 0.5;
}

fn rotate2d(coord_in: vec2<f32>, angle: f32) -> vec2<f32> {
    var c = coord_in - 0.5;
    let ca = cos(angle);
    let sa = sin(angle);
    c = vec2<f32>(c.x * ca - c.y * sa, c.x * sa + c.y * ca);
    return c + 0.5;
}

fn dither(uv1: vec2<f32>, uv2: vec2<f32>) -> bool {
    return (uv1.x + uv2.y) % (2.0 / pu.uPixels) <= 1.0 / pu.uPixels;
}

fn circleNoise(uv_in: vec2<f32>) -> f32 {
    var uv = uv_in;
    let uv_y = floor(uv.y);
    uv.x += uv_y * 0.31;
    let f = fract(uv);
    let h = rand(vec2<f32>(floor(uv.x), floor(uv_y)));
    let m = length(f - 0.25 - (h * 0.5));
    let r = h * 0.25;
    return smoothstep(0.0, r, m * 0.75);
}

fn cloudAlpha(uv: vec2<f32>) -> f32 {
    var c_noise = 0.0;
    for (var i = 0; i < 9; i++) {
        c_noise += circleNoise((uv * pu.uSize * 0.3) + (f32(i + 1) + 10.0) + vec2<f32>(pu.uTime * pu.uTimeSpeed, 0.0));
    }
    return fbm(uv * pu.uSize + c_noise + vec2<f32>(pu.uTime * pu.uTimeSpeed, 0.0));
}

// Simplified: only terran planet for WGSL (most common case)
// Other types fall back to a solid color circle
@fragment
fn mainFragment(input: VSOutput) -> @location(0) vec4<f32> {
    let uv = input.vUV;
    let uvPix = floor(uv * pu.uPixels) / pu.uPixels;

    let d_circle = distance(uvPix, vec2<f32>(0.5));
    let a = step(d_circle, 0.49999);
    if (a < 0.5) {
        return vec4<f32>(0.0);
    }

    let dith = dither(uv, uvPix);
    let suv = spherify(uvPix);
    let d_light = distance(suv, pu.uLightOrigin);
    let ruv = rotate2d(suv, pu.uRotation);

    let base_uv = ruv * pu.uSize + vec2<f32>(pu.uTime * pu.uTimeSpeed, 0.0);
    let fbm1 = fbm(base_uv);
    let fbm2v = fbm(base_uv - pu.uLightOrigin * fbm1);
    let fbm3v = fbm(base_uv - pu.uLightOrigin * 1.5 * fbm1);
    var fbm4v = fbm(base_uv - pu.uLightOrigin * 2.0 * fbm1);

    var dl = d_light;
    if (dl > pu.uLightBorder2) {
        fbm4v *= 1.8;
    } else if (dl > pu.uLightBorder1) {
        fbm4v *= 1.05;
    } else {
        fbm4v *= 0.9;
    }

    dl = pow(dl, 2.0) * 0.4;
    var col = pu.uColors3;
    if (fbm4v + dl < fbm1 * 1.5) { col = pu.uColors2; }
    if (fbm3v + dl < fbm1) { col = pu.uColors1; }
    if (fbm2v + dl < fbm1) { col = pu.uColors0; }

    return vec4<f32>(col.rgb * a, a);
}
