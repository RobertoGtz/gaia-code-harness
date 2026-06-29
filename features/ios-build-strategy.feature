Feature: iOS build strategy for large Tuist monorepos
  Como operador de GAIA quiero elegir cómo validar el código generado en
  monorepos iOS grandes para que el pipeline sea rápido y confiable sin
  depender de una única herramienta.

  @s1
  Scenario: resolve strategy validates dependencies without full compilation
    Given a Tuist iOS monorepo workspace with resolved plugin dependencies
    When the job runs with buildStrategy "resolve"
    Then the build stage reports success
    And the log contains "swift package resolve" or "tuist install"
    And no full app compilation is attempted

  @s2
  Scenario: tuist strategy builds a Tuist module
    Given a module containing Project.swift
    When the job runs with buildStrategy "tuist"
    Then the build stage reports success
    And the log contains "tuist build"

  @s3
  Scenario: auto strategy succeeds with Tuist when available
    Given a Tuist iOS monorepo workspace with resolvable dependencies
    When the job runs with buildStrategy "auto"
    Then the build stage reports success
    And the build log contains "tuist build"

  @s4
  Scenario: auto strategy falls back to xcodebuild when tuist fails
    Given a workspace where tuist build returns a non-zero exit code
    When the job runs with buildStrategy "auto"
    Then the build stage reports success
    And the build log contains "xcodebuild"

  @s5
  Scenario: auto strategy falls back to resolve when neither tuist nor xcodebuild pass
    Given a workspace where tuist build and xcodebuild both fail
    When the job runs with buildStrategy "auto"
    Then the build stage reports success
    And the log contains "swift package resolve"

  @s6
  Scenario: xcodebuild strategy works for a standalone non-Tuist project
    Given a standalone iOS project with an .xcodeproj and no Tuist files
    When the job runs with buildStrategy "xcodebuild"
    Then the build stage reports success
    And the log contains "xcodebuild build"

  @s7
  Scenario: repository setup preserves GitHub origin from local clone
    Given LOCAL_REPOS_PATH points to a local clone with a GitHub origin
    When setupRepository prepares the workspace
    Then the workspace origin is the GitHub URL
    And the local clone is copied or cloned successfully

  @s8
  Scenario: repository setup copies Tuist cache when available
    Given LOCAL_REPOS_PATH contains a repo with Tuist/.build
    When setupRepository prepares the workspace
    Then Tuist/.build is copied from the local clone
    And the build stage can resolve dependencies without network access

  @s9
  Scenario: repository setup skips Tuist cache copy when destination already exists
    Given the workspace already contains a Tuist/.build directory
    When setupRepository prepares the workspace
    Then the existing Tuist/.build is preserved
    And no copy is attempted

  @s10
  Scenario: push and PR use the real GitHub upstream
    Given the workspace origin is set to a GitHub owner/repo
    When the reviewer creates the pull request
    Then the PR URL contains the real GitHub owner and repo
    And the branch is pushed to origin

  @s11
  Scenario: file system limits large monorepo structure
    Given a monorepo directory with more than 500 files and broken symlinks
    When the spec author reads the directory structure
    Then the structure is capped at 500 files
    And broken symlinks are excluded

  @s12
  Scenario: mutation score for touched files meets threshold
    Given changes exist in git.ts, repo.ts, reviewer.ts, file.ts and xcode-runner.ts
    When mutation testing runs with threshold 80%
    Then every touched file scores at least 80%
    And surviving mutants are documented
