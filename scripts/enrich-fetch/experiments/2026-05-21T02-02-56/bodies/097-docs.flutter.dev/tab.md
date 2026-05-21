Flutter mobile and desktop apps can use the [dart:ffi](https://api.dart.dev/dart-ffi/dart-ffi-library.html) library to call native C APIs. _FFI_ stands for [_foreign function interface._](https://en.wikipedia.org/wiki/Foreign_function_interface) Other terms for similar functionality include _native interface_ and _language bindings._

Before your library or program can use the FFI library to bind to native code, you must ensure that the native code is loaded and its symbols are visible to Dart. This page focuses on compiling, packaging, and loading iOS native code within a Flutter plugin or app.

This tutorial demonstrates how to bundle C/C++ sources in a Flutter plugin and bind to them using the Dart FFI library on iOS. In this walkthrough, you'll create a C function that implements 32-bit addition and then exposes it through a Dart plugin named "native\_add".

## Dynamic vs static linking

[#](#dynamic-vs-static-linking)

A native library can be linked into an app either dynamically or statically. A statically linked library is embedded into the app's executable image, and is loaded when the app starts.

Symbols from a statically linked library can be loaded using `DynamicLibrary.executable` or `DynamicLibrary.process`.

A dynamically linked library, by contrast, is distributed in a separate file or folder within the app, and loaded on-demand. On iOS, the dynamically linked library is distributed as a `.framework` folder.

A dynamically linked library can be loaded into Dart using `DynamicLibrary.open`.

API documentation is available from the [Dart API reference documentation](https://api.dart.dev/).

## Create an FFI plugin

[#](#create-an-ffi-plugin)

To create an FFI plugin called "native\_add", do the following:

```
flutter create --platforms=android,ios,macos,windows,linux --template=plugin_ffi native_add
cd native_add
```

This will create a plugin with C/C++ sources in `native_add/src`. These sources are built by the native build files in the various os build folders.

The FFI library can only bind against C symbols, so in C++ these symbols are marked `extern "C"`.

You should also add attributes to indicate that the symbols are referenced from Dart, to prevent the linker from discarding the symbols during link-time optimization. `__attribute__((visibility("default"))) __attribute__((used))`.

On iOS, the `native_add/ios/native_add.podspec` links the code.

The native code is invoked from dart in `lib/native_add_bindings_generated.dart`.

The bindings are generated with [`package:ffigen`](https://pub.dev/packages/ffigen).

Dynamically linked libraries are automatically loaded by the dynamic linker when the app starts. Their constituent symbols can be resolved using [`DynamicLibrary.process`](https://api.dart.dev/dart-ffi/DynamicLibrary/DynamicLibrary.process.html). You can also get a handle to the library with [`DynamicLibrary.open`](https://api.dart.dev/dart-ffi/DynamicLibrary/DynamicLibrary.open.html) to restrict the scope of symbol resolution, but it's unclear how Apple's review process handles this.

Symbols statically linked into the application binary can be resolved using [`DynamicLibrary.executable`](https://api.dart.dev/dart-ffi/DynamicLibrary/DynamicLibrary.executable.html) or [`DynamicLibrary.process`](https://api.dart.dev/dart-ffi/DynamicLibrary/DynamicLibrary.process.html).

To link against a platform library, use the following instructions:

1.  In Xcode, open `Runner.xcworkspace`.
2.  Select the target platform.
3.  Click **+** in the **Linked Frameworks and Libraries** section.
4.  Select the system library to link against.

#### First-party library

[#](#first-party-library)

A first-party native library can be included either as source or as a (signed) `.framework` file. It's probably possible to include statically linked archives as well, but it requires testing.

To link directly to source code, use the following instructions:

1.  In Xcode, open `Runner.xcworkspace`.
    
2.  Add the C/C++/Objective-C/Swift source files to the Xcode project.
    
3.  Add the following prefix to the exported symbol declarations to ensure they are visible to Dart:
    
    **C/C++/Objective-C**
    
    objc
    
    ```
    extern "C" /* <= C++ only */ __attribute__((visibility("default"))) __attribute__((used))
    ```
    
    **Swift**
    
    swift
    
    ```
    @_cdecl("myFunctionName")
    ```
    

#### Compiled (dynamic) library

[#](#compiled-dynamic-library)

To link to a compiled dynamic library, use the following instructions:

1.  If a properly signed `Framework` file is present, open `Runner.xcworkspace`.
2.  Add the framework file to the **Embedded Binaries** section.
3.  Also add it to the **Linked Frameworks & Libraries** section of the target in Xcode.

#### Open-source third-party library

[#](#open-source-third-party-library)

To create a Flutter plugin that includes both C/C++/Objective-C _and_ Dart code, use the following instructions:

1.  In your plugin project, open `ios/<myproject>.podspec`.
2.  Add the native code to the `source_files` field.

The native code is then statically linked into the application binary of any app that uses this plugin.

#### Closed-source third-party library

[#](#closed-source-third-party-library)

To create a Flutter plugin that includes Dart source code, but distribute the C/C++ library in binary form, use the following instructions:

1.  In your plugin project, open `ios/<myproject>.podspec`.
2.  Add a `vendored_frameworks` field. See the [CocoaPods example](https://github.com/CocoaPods/CocoaPods/blob/master/examples/Vendored%20Framework%20Example/Example%20Pods/VendoredFrameworkExample.podspec).

## Stripping iOS symbols

[#](#stripping-ios-symbols)

When creating a release archive (IPA), the symbols are stripped by Xcode.

1.  In Xcode, go to **Target Runner > Build Settings > Strip Style**.
2.  Change from **All Symbols** to **Non-Global Symbols**.

To learn more about C interoperability, check out these videos:

*   [C interoperability with Dart FFI](https://www.youtube.com/watch?v=2MMK7YoFgaA)
*   [How to Use Dart FFI to Build a Retro Audio Player](https://www.youtube.com/watch?v=05Wn2oM_nWw)

Was this page's content helpful?

Unless stated otherwise, the documentation on this site reflects Flutter 3.44.0. Page last updated on 2026-05-11. [View source](https://github.com/flutter/website/blob/main/sites/docs/src/content/platform-integration/ios/c-interop.md) or [report an issue](https://github.com/flutter/website/issues/new?template=1_page_issue.yml&page-url=https://docs.flutter.dev/platform-integration/ios/c-interop&page-source=https://github.com/flutter/website/blob/main/sites/docs/src/content/platform-integration/ios/c-interop.md "Report an issue with this page").