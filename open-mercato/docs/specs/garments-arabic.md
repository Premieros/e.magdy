# Arabic for PremierOS Garments

Add an application-owned Arabic locale using the installed Open Mercato 0.9.0 locale registry. Preserve the shipped languages and English fallback. Arabic is selectable through the existing locale endpoint and language switcher, including before login.

## Scope

Translate the enabled-module navigation, authentication UI, common forms and tables, and primary business labels; preserve interpolation tokens and technical identifiers. Set document direction on server render and client locale changes, provide Radix direction for accessible interactions, and adapt physical sidebar coordinates and text alignment. Email, numeric inputs and technical codes retain left-to-right direction.

No database migrations, account changes, encryption changes, credentials or framework package edits.

Technical and advanced messages without reviewed translations use the official English fallback. No unreviewed machine translations are included.

## Acceptance

Arabic appears as العربية in the language selector. Selecting it renders Arabic login labels and RTL document direction, retaining locale preference across navigation. English remains selectable. Reviewed Arabic keys and interpolation tokens match the English source; sidebar expanded/collapsed/mobile positioning is compatible with RTL. Type checking and production build succeed.
