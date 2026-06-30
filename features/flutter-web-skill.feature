Feature: Update Flutter Web skill for RPP multiplatform monorepos
  Como operador de GAIA quiero que el skill de Flutter Web entienda la
  estructura real de los monorepos de RPP (melos + FVM + paquetes de
  Bitbucket) para que el pipeline pueda generar, validar y entregar código
  compatible sin inventar convenciones de otra organización.

  @s1
  Scenario: skill recognizes melos + FVM monorepo structure
    Given a repo with melos.yaml, .fvmrc and packages/ + apps/
    When the skill verifies environment
    Then it reports valid
    And it notes flutter 3.35.7 and sdk 3.9.2

  @s2
  Scenario: skill runs melos bootstrap before pub get
    Given a monorepo with interdependent packages
    When the skill runs build
    Then it executes `melos bootstrap` first
    And then `flutter pub get` inside the app package

  @s3
  Scenario: skill detects fluro-based routing and package exports
    Given a feature package with lib/src/core/{feature}_router.dart
    When the skill generates prompt context
    Then it uses fluro Handler and Route definitions
    And it expects {feature}.dart to export router and routes

  @s4
  Scenario: skill flags mobile-only packages in Flutter Web
    Given a pubspec.yaml with camera, image_picker or local_auth
    When the skill verifies environment
    Then it throws an environment error listing the forbidden packages

  @s5
  Scenario: skill uses correct package layout for generated code
    Given a feature module named account_summary
    When the implementer writes code
    Then it places core under lib/src/core/
    And data under lib/src/data/
    And presentation under lib/src/presentation/

  @s6
  Scenario: skill knows dependencies come from Bitbucket git overrides
    Given pubspec_overrides.yaml contains bitbucket.org git URLs
    When the skill lists external dependencies
    Then it distinguishes local path overrides from Bitbucket git overrides
    And it warns that credentials must be injected before CI build

  @s7
  Scenario: skill builds web app for deployment
    Given the apps/app package is ready
    When the skill runs build web
    Then it executes `flutter build web --release --base-href=/banking-accounts/pyme/account-basics/`
    And it passes dart-define for BACKEND_API, FIREBASE_* and BRAZE_*

  @s8
  Scenario: skill runs tests per feature package
    Given a feature package with a test/ directory
    When the skill runs tests
    Then it executes `flutter test --coverage` inside that package
    And it reports the package result separately

  @s9
  Scenario: skill analyzes Dart code with melos package conventions
    Given a feature package with generated .g.dart files
    When the skill runs analyze
    Then it excludes *.g.dart, *.freezed.dart and *.config.dart
    And it runs `dart analyze` in the package root

  @s10
  Scenario: skill respects different repo owner and credential set
    Given the repo origin is rpp-co/rpp-account-basics-multiplatform-pyme
    When the reviewer creates a pull request
    Then it uses the RPP GitHub owner and token
    And it does not reuse iOS rappi-inc credentials
