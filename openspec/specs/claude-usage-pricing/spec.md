# claude-usage-pricing Specification

## Purpose

Turns recorded token counts into USD so every figure the plugin shows is a price, and so a model without a known rate is visible instead of silently priced wrong.

## Requirements

### Requirement: Spend is priced at read time

Spend SHALL be computed from token counts and the price table each time a figure is read. Rates SHALL be USD per million tokens, with separate rates for input, output, five-minute cache write, one-hour cache write, and cache read.

#### Scenario: Rate corrected

- **WHEN** a rate in the price table changes
- **THEN** all recorded history shows the new price on the next read

### Requirement: Model ids are matched exactly, minus suffixes that do not change price

A `[...]` context-window suffix such as `[1m]` SHALL be removed before lookup. A trailing date suffix (`-YYYYMMDD`) SHALL be removed before lookup. A model id SHALL NOT match a different model version by prefix.

#### Scenario: Long-context suffix

- **WHEN** a response used `claude-opus-5-5[1m]`
- **THEN** it is priced at the `claude-opus-5-5` rates

#### Scenario: Dated model id

- **WHEN** a response used `claude-haiku-4-5-20251001`
- **THEN** it is priced at the `claude-haiku-4-5` rates

#### Scenario: Newer version of a priced family

- **WHEN** a response used `claude-opus-5-5` and the table has `claude-opus-5` but not `claude-opus-5-5`
- **THEN** the model is unpriced

### Requirement: Unpriced models are excluded and named

A model with no price table entry SHALL be excluded from every spend figure. The dashboard SHALL name each unpriced model it saw. There SHALL be no fallback rate.

#### Scenario: Unknown model

- **WHEN** the index holds tokens for a model with no table entry
- **THEN** no spend figure includes them
- **AND** the dashboard shows a banner naming that model
