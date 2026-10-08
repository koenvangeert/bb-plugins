## ADDED Requirements

### Requirement: Tab filters
Each tab SHALL have a list of filters. A filter SHALL have one Jira field, the operator `in` or `not in`, and one or more values. A tab with filters SHALL show only the tickets that match its JQL and every filter. Values in one filter SHALL match as OR. Two or more filters SHALL match as AND.

#### Scenario: One filter with two values
- **WHEN** the "Ready to pick up" tab has the filter Status `in` "To Do", "In Review"
- **THEN** the tab shows only its tickets with status "To Do" or "In Review"

#### Scenario: Two filters
- **WHEN** a tab has the filter Status `in` "To Do" and the filter Fix version `in` "26.10"
- **THEN** the tab shows only its tickets with status "To Do" and fix version "26.10"

#### Scenario: Not in
- **WHEN** a tab has the filter Assignee `not in` "Ann Lee"
- **THEN** the tab shows its tickets that are not assigned to Ann Lee, and its unassigned tickets

#### Scenario: Count with filters
- **WHEN** a tab with filters shows 12 tickets
- **THEN** the tab label shows the name and `(12)`

### Requirement: Empty filter value
A filter SHALL offer an "(empty)" value. With `in`, "(empty)" SHALL match tickets where the field has no value. With `not in`, "(empty)" SHALL exclude those tickets.

#### Scenario: Unassigned tickets
- **WHEN** a tab has the filter Assignee `in` "(empty)"
- **THEN** the tab shows only its unassigned tickets

### Requirement: Filters keep the tab sort order
When the tab JQL has an `ORDER BY` clause, the filtered list SHALL keep that order.

#### Scenario: Tab JQL with ORDER BY
- **WHEN** the tab JQL is `project = DEV ORDER BY priority DESC` and the tab has a Status filter
- **THEN** the tab shows the filtered tickets sorted by priority, highest first

### Requirement: Filter field picker
The filter bar SHALL have a "+ Filter" control that lists these Jira system fields by name: Status, Type, Priority, Assignee, Reporter, Creator, Labels, Fix versions, Affects versions, Components, Resolution, Project, and Parent. The picker SHALL NOT offer other fields.

#### Scenario: Pick a field by name
- **WHEN** the user opens "+ Filter"
- **THEN** the picker lists the system fields by name, for example "Status" and "Fix versions"

#### Scenario: Date, text, and custom fields not offered
- **WHEN** the user opens "+ Filter"
- **THEN** the picker does not list "Created", "Description", or a custom field such as "Sprint"

### Requirement: Filter values
For Status, Type, Priority, Assignee, Reporter, Creator, and Labels, the filter SHALL offer the values found in the tab's results without its filters. For the other fields in the picker, the filter SHALL take free-text values.

#### Scenario: Dropdown of real values
- **WHEN** the tickets of the "Ready to pick up" tab have the statuses "To Do" and "In Review"
- **THEN** the Status filter offers "To Do", "In Review", and "(empty)"

#### Scenario: Values stay when a filter is active
- **WHEN** the tab has the filter Status `in` "To Do"
- **THEN** the Status filter still offers "In Review"

#### Scenario: Free-text value
- **WHEN** the user adds a Fix version filter
- **THEN** the filter takes typed values, for example "26.10"

#### Scenario: Values from a limited list
- **WHEN** the tab JQL matches more than 200 tickets
- **THEN** the dropdown says that its values come from the first 200 tickets

### Requirement: Apply filters checks the query
Before the plugin saves a change to the filters of a tab, it SHALL run the filtered query once through `acli`. The plugin SHALL save the filters only when the query runs without error.

#### Scenario: Valid filter
- **WHEN** the user applies the filter Fix version `in` "26.10" and the query runs
- **THEN** the plugin saves the filter and the tab shows the filtered tickets without a separate refresh

#### Scenario: Invalid filter
- **WHEN** the user applies a filter that makes `acli` return a JQL error
- **THEN** the dialog shows the `acli` error text and the tab keeps its earlier filters and list

#### Scenario: Remove a filter
- **WHEN** the user removes the last filter of a tab
- **THEN** the tab shows all tickets that match its JQL

### Requirement: Filters are saved per tab
The plugin SHALL save the filters of each tab. Filters SHALL stay after a page reload and a plugin restart. A change to the tab name or JQL SHALL keep its filters. Deleting a tab SHALL delete its filters.

#### Scenario: Reload
- **WHEN** the user adds a filter to a tab and reloads the page
- **THEN** the tab shows the same filter and the filtered list

#### Scenario: Filters on another tab
- **WHEN** the "Ready to pick up" tab has a filter and the "My tickets" tab has none
- **THEN** the "My tickets" tab shows all tickets that match its JQL

#### Scenario: Edit the tab JQL
- **WHEN** the user changes the JQL of a tab with a Status filter and the new query runs
- **THEN** the tab keeps the Status filter and shows the tickets that match the new JQL and the filter

### Requirement: Refresh with filters
On each refresh, a tab with filters SHALL read its tickets with the filtered query, and SHALL read its dropdown values with the tab JQL alone. When one of these reads fails, the tab SHALL keep its last good list and its last good values, and SHALL show the error.

#### Scenario: Refresh a filtered tab
- **WHEN** a tab with a Status filter refreshes
- **THEN** its list holds the tickets that match its JQL and the filter, and its dropdown values come from the tab JQL alone

#### Scenario: Filtered read fails
- **WHEN** the filtered read of a tab fails on refresh
- **THEN** the tab shows its earlier list and the error text
