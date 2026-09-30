# LeeWay Chatterbox browser adapter

Reused from the user-owned canonical reference `4citeB4U/RapidWebDev`, commit `5b56120c7b896ad501cdd410995fac611b34ee1c`, `brain/public/browser-voice.js` and `chatterbox.worker.js`. The worker credits the Resemble AI Transformers.js Chatterbox demo architecture. Model: `onnx-community/chatterbox-ONNX` revision `3cab09af388d3f02bba43443fce88c1f4525ac43` (model card declares MIT); runtime dependency Transformers.js 4.3.0.

Approved reference: `Agent_Voice_One.m4a` excerpt, whose WAV SHA-256 is `638c88b332ecc7a21950511871c724f68f3eb566c59157e46493ee79ec55970e`. Reference metadata accompanies the WAV. Calm exaggeration 0.25 and pitch-preserved 1.1× playback match the canonical profile. This is not the older host XTTS voice reference.

Logistics changes: remove inaccurate microphone-interruption copy (this UI does not yet capture microphone), verify reference content hash, add explicit storage preflight and model-download consent in the calling UI. Existing complete model files are reused by Transformers.js browser caching within this origin; other sites/apps cannot be scanned. Cache retention and phone inference performance require device qualification. Stop immediately suppresses local playback; Unload terminates the worker. No claim of real-time generation or acoustic quality is made.
