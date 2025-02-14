#include <emscripten.h>
#include <string.h>

EMSCRIPTEN_KEEPALIVE
const char* get_domain() {
    // Get domain from JavaScript
    const char* domain = emscripten_run_script_string("window.location.hostname");
    return domain;
} 