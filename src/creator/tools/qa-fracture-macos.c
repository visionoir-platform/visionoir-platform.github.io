/* Tiny offline shader test on macOS, using a 160 x 128 framebuffer.
   From the repository root:
   cc -Wno-deprecated-declarations src/creator/tools/qa-fracture-macos.c -framework OpenGL -o /tmp/qa-fracture
   /tmp/qa-fracture src/creator/finish.js
*/
#include <OpenGL/OpenGL.h>
#include <OpenGL/gl3.h>
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { width = 160, height = 128 };
static unsigned char image[height][width][4], previous[height][width];

static GLuint compile(GLenum type, const char **parts, int count) {
  GLuint id = glCreateShader(type);
  glShaderSource(id, count, parts, NULL);
  glCompileShader(id);
  GLint ok;
  glGetShaderiv(id, GL_COMPILE_STATUS, &ok);
  if (!ok) {
    char error[2048]; glGetShaderInfoLog(id, sizeof(error), NULL, error);
    fprintf(stderr, "%s\n", error); exit(1);
  }
  return id;
}

int main(int argc, char **argv) {
  assert(argc == 2);
  FILE *in = fopen(argv[1], "rb"); assert(in);
  fseek(in, 0, SEEK_END); long bytes = ftell(in); rewind(in);
  char *source = calloc(bytes + 1, 1); assert(source);
  assert(fread(source, 1, bytes, in) == (size_t)bytes); fclose(in);
  // Compile the same coordinates, release mask and grain used by the mesh and its shards.
  const char *marker = "const shell = /* glsl */ `";
  char *start = strstr(source, marker); assert(start); start += strlen(marker);
  char *end = strchr(start, '`'); assert(end); *end = '\0';
  CGLPixelFormatAttribute attributes[] = {kCGLPFAOpenGLProfile, (CGLPixelFormatAttribute)kCGLOGLPVersion_3_2_Core, kCGLPFAAllowOfflineRenderers, 0};
  CGLPixelFormatObj format; GLint count; CGLContextObj context;
  assert(CGLChoosePixelFormat(attributes, &format, &count) == kCGLNoError && count > 0);
  assert(CGLCreateContext(format, NULL, &context) == kCGLNoError);
  assert(CGLSetCurrentContext(context) == kCGLNoError);
  const char *vertex = "#version 150\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}";
  const char *fragment[] = {"#version 150\nout vec4 result;\n", start,
    "void main(){vec2 uv=gl_FragCoord.xy/vec2(160.,128.);vec3 p=vec3(uv.x*1.5-.75,uv.y*2.4-1.2,.18);"
    "float m=fractureMargin(p);result=vec4(float(m<0.),float(m>=0.&&m<.05),0.,1.);}"};
  GLuint program = glCreateProgram();
  glAttachShader(program, compile(GL_VERTEX_SHADER, &vertex, 1));
  glAttachShader(program, compile(GL_FRAGMENT_SHADER, fragment, 3));
  glLinkProgram(program); GLint linked; glGetProgramiv(program, GL_LINK_STATUS, &linked); assert(linked);
  glUseProgram(program);
  GLuint vao, buffer, target;
  glGenVertexArrays(1, &vao); glBindVertexArray(vao);
  glGenFramebuffers(1, &target); glBindFramebuffer(GL_FRAMEBUFFER, target);
  glGenRenderbuffers(1, &buffer); glBindRenderbuffer(GL_RENDERBUFFER, buffer);
  glRenderbufferStorage(GL_RENDERBUFFER, GL_RGBA8, width, height);
  glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_RENDERBUFFER, buffer);
  assert(glCheckFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE);
  glViewport(0, 0, width, height);
  const float steps[] = {0, .20f, .40f, .60f, .85f, .40f, 0};
  for (int profile = 0; profile < 6; profile++) {
    glUniform1f(glGetUniformLocation(program, "uProfile"), profile);
    for (int liquid = 0; liquid <= 1; liquid++) {
      glUniform1f(glGetUniformLocation(program, "uLiquid"), liquid);
      int middleCount = 0, previousCount = 0;
      for (int step = 0; step < 7; step++) {
        glUniform1f(glGetUniformLocation(program, "uScatter"), steps[step]);
        glDrawArrays(GL_TRIANGLES, 0, 3);
        glReadPixels(0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, image);
        int shed = 0, lip = 0, changes = 0, neighbors = 0;
        for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
          int cut = image[y][x][0] > 127;
          int hot = image[y][x][1] > 127;
          if (y >= 101 || x < width/2) assert(!cut && !hot);
          if (step && step <= 4) assert(!previous[y][x] || cut);
          else if (step > 4) assert(previous[y][x] || !cut);
          previous[y][x] = cut; shed += cut; lip += hot;
          if (x && y && cut) {
            changes += (image[y][x-1][0] == 0) + (image[y-1][x][0] == 0);
            neighbors += 2;
          }
        }
        if (step == 0 || step == 6) assert(shed == 0 && lip == 0);
        if (step > 0 && step <= 4) assert(shed > previousCount && lip > 0);
        if (step == 2) {
          middleCount = shed;
          // Detached pixels join the same advancing front instead of dissolving as independent cubes.
          assert(changes < neighbors * .12);
          printf("profile %d liquid %d: cut %d, rim %d, neighbor disagreement %.4f\n",profile,liquid,shed,lip,(double)changes/neighbors);
        }
        if (step == 5) assert(shed == middleCount);
        previousCount = shed;
      }
    }
  }
  assert(glGetError() == GL_NO_ERROR);
  printf("84 masks passed on %s\n", glGetString(GL_RENDERER));
  CGLSetCurrentContext(NULL); CGLDestroyContext(context); CGLDestroyPixelFormat(format); free(source);
}
