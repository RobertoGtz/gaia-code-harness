# Gherkin — GAIA Code Harness

> Once `project-spec.md` is agreed upon, the `gherkin_author` distills it into executable scenarios.
> The `.feature` files are the contract the human approves at the gate and the map the `tdd_craftsman` follows.

Files live in `features/<name>.feature`, where `<name>` matches
the `name` field in `feature_list.json`.

---

## Structure

```gherkin
Feature: <purpose in one sentence>
  As a <role> I want <capability> so that <benefit>.   # optional context

  @s1
  Scenario: <observable behavior>
    Given <starting state>
    When <concrete user action>
    Then <measurable result: stdout / stderr / exit code / screen>

  @s2
  Scenario: <edge case or error>
    Given ...
    When ...
    Then ...
```

---

## Hard rules

- **One `Scenario` per observable behavior**, including error paths
  (nonexistent id, invalid flag, network down, empty list). If
  `project-spec.md` mentions an edge case, it gets its own scenario.
- **Stable tags** `@s1`, `@s2`, … They are the identifier that
  `tdd_craftsman` (`@s → test` map) and `judge` (coverage) reference.
- **Every `Then` asserts something measurable.** Forbidden: "the system works" or
  "the behavior is correct". Valid: "the screen shows X", "the exit code is 0",
  "the PR was created on GitHub", "the log contains Y".
- **Only one `When` per scenario** (the action under test). If you need
  two actions, they are probably two scenarios.
- **No implementation details.** The `.feature` describes behavior,
  not functions or classes. "When `executeTDD()` is called" is wrong;
  "When the job is created with tddMode: true" is correct.

---

## Example (feature `pull_to_refresh` — iOS platform)

```gherkin
Feature: Pull-to-refresh on the feed
  As a user I want to refresh the feed by dragging down to see
  recent content without restarting the app.

  @s1
  Scenario: Feed updates on pull-to-refresh
    Given the feed screen is visible with loaded content
    When the user drags the list down and releases
    Then the loading indicator is visible during the refresh
    And the list shows the new items received from the server

  @s2
  Scenario: Loading indicator disappears after refresh completes
    Given the user has started a pull-to-refresh
    When the server response arrives
    Then the loading indicator disappears
    And the list is in idle state

  @s3
  Scenario: Pull-to-refresh does not duplicate existing items
    Given the feed has 3 items
    When the user pulls-to-refresh and the server returns the same 3 items
    Then the list still shows exactly 3 items

  @s4
  Scenario: Network error during pull-to-refresh
    Given the server is unavailable
    When the user pulls-to-refresh
    Then an error message is shown
    And the previous items remain visible in the list
```

---

## From Gherkin to test (without a BDD framework)

We do not use `behave`, `XCTest-Gherkin`, or similar to avoid adding
dependencies. Each `Scenario` is translated **manually** into a test whose name
references the scenario:

```
@s1 → testFeedRefreshesOnPullToRefresh
@s2 → testLoadingIndicatorDisappearsAfterRefresh
@s3 → testPullToRefreshDoesNotDuplicateItems
@s4 → testNetworkErrorShowsMessageDuringRefresh
```

The `tdd_craftsman` writes these tests one by one (Red→Green→Refactor) and
leaves the map in `progress/tdd_<name>.md`. This way the `.feature` remains the
human-readable source of truth without paying the cost of a framework.

---

## Common mistakes to avoid

| ❌ Incorrect                      | ✅ Correct                               |
| ---------------------------------- | ---------------------------------------- |
| `Then the code works`              | `Then the output contains "3 items"`     |
| `Given the system is configured`   | `Given the store has 3 notes saved`      |
| `When the feature runs`            | `When the user taps the "Refresh" button` |
| Scenario without `@s` tag          | Every scenario has `@s1`, `@s2`, etc.  |
| Multiple `When` in one scenario  | One `When` per scenario                  |
