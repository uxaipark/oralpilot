# OralPilot localization

`LocaleProvider` owns the UI language (`ko`, `en`, `ja`) and the device preference `oralpilot.locale.v1`. It is independent of the clinical plan storage schema. Language changes update the existing React tree and document language, without changing tooth numbering, model geometry, camera state, IDs or clinical values.

`useLocalize()` is the presentation boundary used by each workspace component. `localizeNode()` translates rendered copy and accessibility descriptions; it does not rewrite the DOM or translate form values, callbacks, URLs or clinical objects. Mark patient-authored text with `translate="no"`. Native language labels use the same protection.

`messages.json` is the bundled offline catalog. No runtime translation service is used and no clinical data is sent for translation. `reviewed.json` contains curated terminology, workflow controls and the complete treatment-sequence copy. Korean/English source copy is used as the lookup key; `{0}`, `{1}`, etc. preserve runtime tooth IDs, dimensions and counts. Specific patterns take precedence over generic patterns. Shared, composed display phrases are translated at render time.

When adding copy, include all three locales with identical interpolation slots and add reviewed clinical wording to `reviewed.json`. Clinical calculations and persisted values must remain language-neutral. Tests check catalog completeness, terminology, interpolation, protected data, generated treatment plans and equivalent Korean/English/Japanese dictation commands.

UI language initializes the speech recognizer language. The speech selector remains independently adjustable. Language changes stop an active recognizer and recheck the on-device language model. Microphone availability depends on the browser; Japanese typed shorthand follows the same parser and reducer as Korean and English.
