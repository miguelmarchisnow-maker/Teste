in vec2 aPosition;
in vec2 aUV;

out vec2 vUV;

uniform mat3 uTransformMatrix;
uniform mat3 uProjectionMatrix;

void main() {
    vUV = aUV;
    gl_Position = vec4((uProjectionMatrix * uTransformMatrix * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}
