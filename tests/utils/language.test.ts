import { describe, expect, test } from "bun:test"
import { detectLanguage } from "../../src/utils/language"

describe("detectLanguage", () => {
  test("detects TypeScript from .ts extension", () => {
    expect(detectLanguage("src/index.ts")).toBe("typescript")
  })

  test("detects TypeScript from .tsx extension", () => {
    expect(detectLanguage("components/App.tsx")).toBe("typescript")
  })

  test("detects JavaScript from .js extension", () => {
    expect(detectLanguage("lib/utils.js")).toBe("javascript")
  })

  test("detects Python from .py extension", () => {
    expect(detectLanguage("main.py")).toBe("python")
  })

  test("detects Go from .go extension", () => {
    expect(detectLanguage("cmd/server.go")).toBe("go")
  })

  test("detects Rust from .rs extension", () => {
    expect(detectLanguage("src/main.rs")).toBe("rust")
  })

  test("detects JSON from .json extension", () => {
    expect(detectLanguage("package.json")).toBe("json")
  })

  test("detects YAML from .yml extension", () => {
    expect(detectLanguage("config.yml")).toBe("yaml")
  })

  test("detects YAML from .yaml extension", () => {
    expect(detectLanguage("docker-compose.yaml")).toBe("yaml")
  })

  test("detects Markdown from .md extension", () => {
    expect(detectLanguage("README.md")).toBe("markdown")
  })

  test("returns 'unknown' for unrecognized extensions", () => {
    expect(detectLanguage("data.xyz")).toBe("unknown")
  })

  test("returns 'unknown' for files without extension", () => {
    expect(detectLanguage("Makefile")).toBe("unknown")
  })

  test("handles dotfiles", () => {
    expect(detectLanguage(".gitignore")).toBe("unknown")
  })

  test("detects CSS", () => {
    expect(detectLanguage("styles.css")).toBe("css")
  })

  test("detects HTML", () => {
    expect(detectLanguage("index.html")).toBe("html")
  })

  test("detects C# from .cs extension", () => {
    expect(detectLanguage("Program.cs")).toBe("csharp")
  })

  test("detects Java from .java extension", () => {
    expect(detectLanguage("Main.java")).toBe("java")
  })

  test("detects Ruby from .rb extension", () => {
    expect(detectLanguage("app.rb")).toBe("ruby")
  })

  test("detects PHP from .php extension", () => {
    expect(detectLanguage("index.php")).toBe("php")
  })

  test("detects Swift from .swift extension", () => {
    expect(detectLanguage("ViewController.swift")).toBe("swift")
  })

  test("detects Kotlin from .kt extension", () => {
    expect(detectLanguage("Main.kt")).toBe("kotlin")
  })

  test("detects Shell from .sh extension", () => {
    expect(detectLanguage("setup.sh")).toBe("shell")
  })

  test("detects SQL from .sql extension", () => {
    expect(detectLanguage("schema.sql")).toBe("sql")
  })
})
