> 🌐 [English](../../IMPLEMENTATION_PROGRESS.md) | **Bahasa Indonesia**

# AoKira — Pelacak Progres Implementasi

**Phase Saat Ini:** Phase 1–8 Selesai · Pasca-pengiriman: CI hijau, GitHub Pages live (https://orls967.github.io/AoKiraDeck/)
**Terakhir Diperbarui:** 2026-11-16
**Branch:** `main`
**Remote:** `https://github.com/Orls967/AoKiraDeck.git`

---

## Milestone yang Selesai
- [x] **Phase 0 / Audit Repo**: Mengaudit seluruh 10 spesifikasi kanonis (`PRD.md`, `DATA_MODEL.md`, `SIMULATION_SPEC.md`, `ARCHITECTURE.md`, `API_CONTRACT.md`, `DESIGN.md`, `TEST_PLAN.md`, `flow.md`, `constraints.md`, `README.md`), memverifikasi parameter DH, konvergensi IK DLS, dan clearance tabrakan capsule/box secara analitis.
- [x] **Kebersihan Git (`9da427b`)**: Membuat `.gitignore` dan melepas `.DS_Store` dari indeks Git sambil mempertahankan salinan lokal.
- [x] **Phase 1 — Fondasi & Konfigurasi Kanonis (`c7b3217`)**:
  - Membuat `data/workcell/aokira-workcell.v1.json` dan `data/scenarios/scenario-{a,b,c,d}.json`.
  - Menginisialisasi `crates/aokira-engine` (Rust + `wasm-bindgen` + `serde`), `apps/api` (FastAPI + Pydantic v2 + NumPy/SciPy + `.venv`), dan `apps/web` (Vite + React 18 + TS strict + token Tailwind CSS + R3F/Drei + Zustand + Recharts + Vitest).
  - Mengimplementasikan `AppShell` (5 rute, status pill, drawer navigasi mobile), `WebGLErrorBoundary`, `WebGLFallbackView` (skema SVG 2D), `useReducedMotion`, tipe TS kanonis & pemuat konfigurasi.
  - Terverifikasi: `npm run typecheck`, `npm run test` (2 lulus), `npm run build`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` (1 lulus), `pytest` (1 lulus), `ruff check .`.
- [x] **Phase 3 — Inti Simulasi Rust/WASM Deterministik (`565fb74`)**:
  - Mengimplementasikan `math`, `kinematics` (FK Standard DH, IK DLS 3-seed), `trajectory` (penskalaan waktu quintic), `collision` (capsule-capsule yang tepat, capsule-box, OBB yang dipegang-box dengan ambang near-collision 25 mm), `robot`, `gripper`, `conveyor` (termasuk interlock zona drop saat robot melepas/menarik diri dari billet selesai), `metrics`, `production` (state machine 8 stage), `scheduler`, dan FFI `wasm_bindgen` `AokiraSimEngine`.
  - Menghasilkan fixture kanonis `data/fixtures/baseline-3cycles.golden.json` dan memverifikasi seluruh 22 tes Rust (`RUST-KIN-01..03`, `RUST-IK-01..04`, `RUST-TRAJ-01..03`, `RUST-COL-01..06`, `RUST-PROD-01..06`), `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, dan `wasm-pack build` (`aokira_engine_bg.wasm` `264K`).
- [x] **Phase 5 — Layanan Analytics & Optimasi Python FastAPI Stateless (`a0668f0`)**:
  - Mengimplementasikan skema request/response/error Pydantic v2 `camelCase`, middleware batas payload 5 MB (`413`), handler error `ApiErrorResponse` yang seragam (`VALIDATION_ERROR`, `INVALID_EVENT_SEQUENCE`, `INFEASIBLE_OPTIMIZATION`, `INTERNAL_ERROR`), dan header CORS.
  - Mengimplementasikan `analytics.py` berbasis event, `validation.py`, `energy.py`, `bottleneck.py`, `forecasting.py`, `surrogate.py` quintic analitis, dan `optimization.py` SciPy SLSQP (`/api/v1/analytics/evaluate`, `/api/v1/scenarios/compare`, `/api/v1/optimization/run`), ditambah `apps/api/Dockerfile`.
  - Memverifikasi `ruff check .` (0 error) dan `pytest -v` (8 lulus: `API-01..07` + smoke check, kesesuaian golden fixture `< 0.01%`).
- [x] **Phase 2 — Workcell 3D Inti, Jembatan Worker WASM & Inspektor Digital Twin (`cb8dd13`)**:
  - Mengimplementasikan `apps/web/src/workers/simulation.worker.ts` (Web Worker khusus yang membungkus modul WASM `AokiraSimEngine`), `useSimulationStore` (`liveSnapshotRef` & `liveTracePointsRef` di luar state React, akumulator tick `rAF` `20 ms` dibatasi `200 ms`, log 500 event bergulir, `solveIk` berbasis Promise), dan `useTwinUiStore`.
  - Mengimplementasikan modul scene 3D R3F offline di bawah `apps/web/src/components/scene/` (`RobotArmModel`, `GripperModel`, `ConveyorModels`, `ProcessingStationModel`, `WorkpieceMeshes`, `EnvironmentRig` dengan reach envelope/wireframe tabrakan/frame/jejak TCP, `CameraRig`, `WorkcellCanvas`, `CameraPresetBar`).
  - Mengimplementasikan `DigitalTwinPage.tsx` (Component Tree dengan Isolate/Hide, slider Exploded View, toggle overlay, inspektor FK 6 sendi J1–J6, Cartesian IK Target Probe) dan `DigitalTwinPage.test.tsx` (`FE-02`), menyambungkan inisialisasi worker di `App.tsx`.
  - Memverifikasi `npm run typecheck`, `npm run test` (3 file, 6 lulus), dan `npm run build`.
- [x] **Phase 4 — Showcase Langsung Overview & Simulation Lab (`6caa45e`)**:
  - Menambahkan pengali `playbackSpeed` deterministik (`0.25x`–`4.0x`) ke `useSimulationStore` (langkah WASM tetap `20 ms` dipertahankan) dan mode `compact` pada `CameraPresetBar`.
  - Mengimplementasikan `OverviewPage.tsx` (viewport 3D hero full-bleed dengan `autoOrbit`, kartu peluncuran editorial, HUD telemetri langsung yang tersinkron dengan tick Rust/WASM, showcase demo yang mulai otomatis dan reset dengan bersih saat berpindah ke rute interaktif).
  - Mengimplementasikan `SimulationLabPage.tsx` (dek Transport `Start`/`Pause`/`Resume`/`Stop`/`Step 20ms`/`Reset`/`E-Stop`, kecepatan playback, pemilih Skenario `A–D`, mode `SINGLE`/`FIXED_COUNT`/`CONTINUOUS`, slider parameter, toggle gripper manual, stepper pipeline 8 stage, banner Active Fault, Event Log berkode warna yang dapat difilter, pintasan keyboard) dan `SimulationLabPage.test.tsx` (`FE-01`).
  - Memverifikasi `npm run typecheck`, `npm run test` (4 file, 8 lulus), dan `npm run build`.
- [x] **Phase 6 — UI Performance Analytics & Optimization Center**:
  - Mengimplementasikan `apps/web/src/services/apiClient.ts` (timeout AbortController `3s`/`10s`/`20s` yang ketat, `ApiDomainError` & `BackendUnavailableError` terstruktur) dan `useAnalyticsStore.ts` (polling kesehatan, `/analytics/evaluate`, `/scenarios/compare`, `/optimization/run`), disambungkan ke `App.tsx` -> `<AppShell>`.
  - Mengimplementasikan `AnalyticsPage.tsx` (status kosong tanpa data `FE-03`, 10 KPI turunan event, 3 grafik Recharts, panel pengayaan bottleneck/energi/forecast/konsistensi Python, mode terdegradasi offline `FE-04` dengan `Retry Connection`) dan `OptimizationPage.tsx` (tabel/grafik perbandingan skenario, workbench batas & kendala, kartu rekomendasi SLSQP + `Load into Simulation Lab`, banner `INFEASIBLE_OPTIMIZATION`).
  - Memverifikasi `scripts/test-all.sh` penuh: Rust `22 lulus`, Python `8 lulus` + `ruff check .` bersih, Web `6 file tes / 13 tes lulus` (`FE-01..FE-05`), dan `vite build` produksi.

---

## Keputusan Teknis yang Dicatat
1. **Titik Ujung Capsule Tabrakan (`link-1`..`link-5`, `gripper`)**: Segmen capsule diukur di dalam setiap frame link DH sehingga link yang bersebelahan dan kontak diam/genggam tidak pernah menghasilkan peringatan `NEAR_COLLISION` false-positive (`<= 25 mm`) sepanjang trajektori pick-and-place nominal (`clearance minimum >= 28.85 mm` terhadap geometri statis dan `>= 39.20 mm` clearance-diri non-bersebelahan).
2. **Versi Stack React & R3F**: Memilih React 18.3 + `@react-three/fiber` 8.17 + `@react-three/drei` 9.117 + `three` 0.170 + `recharts` 2.13 + `tailwindcss` 3.4 untuk kompatibilitas peer yang bersih dan bundling produksi yang deterministik.
3. **Modul Ambient Bertipe WASM**: Menambahkan `apps/web/src/types/wasm-engine.d.ts` agar typecheck TypeScript berjalan bersih bersama `apps/web/src/wasm/` yang dihasilkan oleh `scripts/build-wasm.sh`.
4. **Interlock Zona Penempatan Konveyor Output**: Pada subfase release/retraksi `PlaceWorkpiece`, feed belt output berhenti sejenak sementara gripper membuka dan terangkat menjauh dari billet di atas zona drop, mencegah konveyor membawa pergi billet yang menggesek rahang yang sedang turun/membuka.

---

## Tugas yang Tersisa
- [x] **Phase 3 (Engine Rust/WASM)**: Selesai (`cargo test` 22/22 lulus, `wasm-pack` 264K).
- [x] **Phase 5 (Layanan Analytics & Optimasi Python)**: Selesai (`pytest` 8/8 lulus, `ruff check .` bersih).
- [x] **Phase 2 (Workcell 3D Inti)**: Selesai (workcell R3F, jembatan Worker WASM, `FE-02` `DigitalTwinPage` lulus).
- [x] **Phase 4 (Simulation Lab & Showcase Overview)**: Selesai (`OverviewPage`, `SimulationLabPage`, `FE-01`, `npm test` 8/8 lulus).
- [x] **Phase 6 (UI Performance Analytics & Optimization Center)**: Selesai (`apiClient`, `AnalyticsPage`, `OptimizationPage`, `FE-01..FE-05`, `scripts/test-all.sh` hijau).
- [x] **Phase 7 (Pengujian & Baseline Performa)**: Menjalankan Playwright E2E (`E2E-01`..`E2E-05` desktop & mobile), mengukur baseline runtime/build secara empiris, menyelesaikan defect apa pun.
- [x] **Phase 8 (CI/CD & Pengiriman Akhir)**: Menambahkan `.github/workflows/ci-deploy.yml`, memverifikasi konfigurasi Docker & build, memperbarui `README.md`, push commit akhir, menghasilkan Laporan Akhir.

---

## Log Commit & Push Git
| Commit | Ringkasan | Status Push |
|---|---|---|
| `9da427b` | `chore: configure repository gitignore and untrack .DS_Store` | Di-push ke `origin/main` |
| `c7b3217` | `feat: initialize canonical configs and Phase 1 full-stack scaffold` | Di-push ke `origin/main` |
| `565fb74` | `feat(engine): implement deterministic Rust/WASM robotics engine and golden baseline` | Di-push ke `origin/main` |
| `a0668f0` | `feat(api): implement FastAPI analytics and SciPy SLSQP optimization service` | Di-push ke `origin/main` |
| `cb8dd13` | `feat(web): implement R3F 3D workcell, WASM worker bridge, and Digital Twin inspector` | Di-push ke `origin/main` |
| `6caa45e` | `feat(web): implement Overview live showcase and Simulation Lab control deck` | Di-push ke `origin/main` |
| `43bdd21` | `feat(web): implement Performance Analytics and Optimization Center UI` | Di-push ke `origin/main` |

## Phase 7: Integrasi End-to-End, Verifikasi & Baseline Terukur — SELESAI

### Verifikasi E2E (`E2E-01`–`E2E-05`, WebGL GPU Chrome Sungguhan + Backend Uvicorn)
- **E2E-01**: Showcase workcell 3D Overview, stepping Rust/WASM langsung, nol error konsol/halaman (`2.8s`)
- **E2E-02**: Seleksi Digital Twin, preset kamera, overlay, inspektor 6 sendi, umpan balik IK terpecahkan/tak terjangkau (`862ms`)
- **E2E-03**: Siklus pick-and-place Simulation Lab penuh + pengayaan Python Analytics & `projectedUnitsPer8hShift` (`4.6s`)
- **E2E-04**: Perbandingan Optimization Center, solver SciPy SLSQP, penanganan error domain infeasible & mode offline (`846ms`)
- **E2E-05**: Viewport mobile responsif (`390x844`) di seluruh 5 rute tanpa overflow horizontal (`587ms`)

### Baseline Performa Phase 7 yang Terukur
- **Rust 1.000 Tick Simulasi (release)**: `22.917 ms` total (`0.0229 ms/tick`)
- **Solusi IK DLS 3-seed Rust (release)**: `0.0133 ms` rata-rata / `0.0148 ms` terburuk (terjangkau); `0.0013 ms` penolakan tak terjangkau
- **FastAPI `POST /api/v1/analytics/evaluate` (1.000 event)**: `22.61 ms` (HTTP `200`)
- **FastAPI `POST /api/v1/optimization/run` (90 evaluasi SciPy SLSQP)**: `7.77 ms` (HTTP `200`)
- **Laju rAF Canvas WebGL (`E2E-01`)**: `60.5 FPS`
- **Biner WASM Produksi (`aokira_engine_bg.wasm`)**: `270.35 kB` mentah / `108.62 kB` gzip (`vite build` dalam `2.93s`)


- Commit: `50e52ff` (`test(e2e): add Playwright E2E suite, perf benchmarks, and Phase 7 fixes`, di-push ke `origin/main`)

## Phase 8: Workflow CI/CD, Persiapan Deployment Produksi & Dokumen Akhir — SELESAI

- Membuat `.github/workflows/ci-deploy.yml` yang mencakup `rust-and-wasm` (`fmt`, `clippy`, `test`, `wasm-pack`), `python-api` (`ruff`, `pytest`, build Docker + smoke test container `/api/v1/health`), `web-and-e2e` (`typecheck`, `vitest`, Playwright `E2E-01..05`, dan build Pages `/AoKiraDeck/` dengan fallback SPA `404.html`), dan `deploy-pages` (`actions/deploy-pages@v4`).
- Memverifikasi validitas YAML workflow (`yaml.safe_load` mem-parse ke-4 job dengan bersih) dan memverifikasi bahwa bundle produksi `VITE_BASE_PATH=/AoKiraDeck/` menulis ulang aset `/AoKiraDeck/`, `/AoKiraDeck/favicon.svg`, dan `/AoKiraDeck/assets/aokira_engine_bg-*.wasm`.
- Memeriksa ketersediaan Docker lokal (`docker info` melaporkan socket daemon tidak tersedia di host macOS; CI menegakkan smoke test image Docker di runner Ubuntu).
- Memperbarui `README.md` dengan tata letak workspace yang diimplementasikan, perintah setup lokal/CI yang terverifikasi, baseline performa Phase 7/8 yang terukur, disclaimer offline/sintetis, dan panduan deployment.

## Pasca-Pengiriman: Perbaikan CI, Peluncuran GitHub Pages & Galeri README — SELESAI (2026-11-16)

- **CI merah pada `9e7fea5`** (Pages tidak pernah ter-deploy). Dua penyebab, keduanya diperbaiki:
  1. Toolchain `stable` CI (Rust 1.100) clippy menandai `collapsible_match` di `production.rs` (1.93 lokal tidak). Blok `if segment_just_finished` bersarang dilipat menjadi match guard; dependensi `serde-wasm-bindgen` yang tidak terpakai dihapus. Diverifikasi dengan `cargo +1.100.0 clippy --all-targets -- -D warnings`.
  2. `RUST-PROD-06` membandingkan golden fixture byte demi byte; libm Linux menghasilkan perbedaan ULP terakhir pada `energyWh` sintetis dibanding fixture yang dibuat di macOS. Tes kini membandingkan pohon JSON secara struktural: urutan event, bilangan bulat, string, dan boolean harus persis; bilangan non-bulat dalam `1e-12` relatif.
- Mengaktifkan GitHub Pages (`build_type=workflow`); ke-4 job CI hijau dan situs ter-deploy dari `main`.
- Mengonversi tautan absolut `file:///Users/...` di semua dokumen menjadi tautan relatif-repositori agar berfungsi di GitHub.
- Menambahkan `apps/web/playwright.screenshots.config.ts` + `apps/web/screenshots/capture.spec.ts` (`npm run screenshots`) yang menghasilkan galeri README di `docs/screenshots/` (Pages live untuk tampilan browser-saja, full stack lokal untuk tampilan berbasis Python).
- Menulis ulang `README.md` (tur fitur per halaman/opsi, mode menjalankan, tabel skenario, diagram arsitektur, setup, CI, keterbatasan) dan mengatur About repositori GitHub (deskripsi, homepage, topics).
- **Observasi tercatat:** dengan batas default, optimizer mengembalikan rekomendasi yang sama untuk `MIN_CYCLE_TIME`, `MIN_ENERGY_PER_UNIT`, dan `BALANCED`. Diselesaikan di bagian berikutnya.

## Overhaul Model & Optimizer + Poles UI — SELESAI (2026-11-16)

**Mengapa tiga objektif identik.** Model energi di spesifikasi tidak punya suku yang menghukum gerakan agresif: daya standby idle (120 W) mendominasi, `k_vel·|q̇|` terintegrasi menjadi konstanta yang tidak bergantung kecepatan, dan `k_acc·|q̈|` hanya tumbuh linear. Energi per unit karenanya turun secara monoton terhadap kecepatan, kecepatan belt, dan dwell yang lebih singkat, sehingga setiap objektif memilih sudut yang sama. Penyelidikan ini mengungkap defect lain:

| Temuan | Dampak | Perbaikan |
|---|---|---|
| Tidak ada rugi penggerak resistif | Min Energy ≡ Min Cycle | Menambahkan `k_res,i·q̈ᵢ²` (`k_res = 0.010·τ_rated`) ke spesifikasi §7.2, Rust `metrics.rs`, surrogate Python. Energi/unit engine kini punya minimum berbentuk U di sekitar kecepatan 1.0×. |
| **Belt input ≥ ~0.45 m/s mendorong bagian berikutnya ke bagian yang sedang diangkat → fault Collision** | Rekomendasi optimizer sendiri (belt 0.5 m/s) crash di engine sungguhan; "Zero-Collision ENFORCED" tidak benar | Interlock PLC belt input selama aktuasi/retraksi `PICK_WORKPIECE` (mencerminkan interlock output yang sudah ada). `RUST-PROD-07` baru menjalankan 16 sudut kotak parameter yang diizinkan; diverifikasi gagal tanpa interlock. |
| Konstanta surrogate Python tidak sinkron dengan `aokira-workcell.v1.json` (keenam batas akselerasi, kecepatan J5/J6, torsi J1/J6) dan ditambal dengan faktor fudge perkalian | Estimasi analitis menyimpang dari engine | Konstanta disinkronkan (dijaga oleh `API-08`), fudge diganti offset yang bermakna secara fisik (4×300 ms gripper + settle, tick hand-off), dikalibrasi dengan `examples/energy_sweep.rs` baru: error siklus ≤ 1.0 %, error energi ≤ 0.8 % pada grid 60 titik (`API-09`). |
| SLSQP macet di titik awalnya | Hasil tidak optimal (misalnya dwell 1420 ms padahal 1200 lebih baik) | Optimizer kini mencari dalam koordinat `[0,1]⁵` ternormalisasi dengan evaluasi tanpa pembulatan/kuantisasi (pembulatan membuat gradien finite-difference nol), selalu mempertahankan iterasi akhir SLSQP, `ftol 1e-9`. Min Energy dalam 0.1 % dari acuan global `differential_evolution` (`API-10`). |
| Bobot `BALANCED` dinormalisasi oleh baseline | Rentang energi (beberapa %) tertelan rentang siklus (~25 %) → Balanced ≡ Min Cycle | Compromise programming: temukan kedua jangkar, normalisasi dengan rentang trade-off yang sebenarnya, lalu terapkan bobot. Balanced kini berada tepat di antara kedua jangkar. |
| Optimizer selalu memangkas dwell proses ke batas bawahnya | Dwell adalah persyaratan proses, bukan tombol penyetelan robot | UI mengunci dwell pada skenario dasar secara default (checkbox opt-in). |
| `targetProductionRatePerHour = 60` | "Production efficiency" selalu ter-clamp 100 %, "target tercapai 461 %" | Target diatur ke 330 u/h (takt ≈ 10,9 s); efisiensi baseline kini 90 %. |

**Rekomendasi yang dihasilkan** (Scenario A, batas default, dwell bebas): Min Cycle 1.40×/1.40× → 8 860 ms, 0,802 Wh · Balanced 1.40×/1.16× → 9 380 ms, 0,780 Wh · Min Energy 1.19×/0.78× → 10 780 ms, 0,765 Wh.

**UI**
- Optimization Center: petunjuk objektif, toggle "Optimize process dwell", **Compare Objectives** (menjalankan ketiganya) dengan tabel hasil, dan **peta trade-off waktu siklus vs energi** (preset, baseline, titik teroptimasi) yang menggantikan grafik batang yang mencampur u/h dengan "cWh = Wh×100".
- Scene 3D: environment Lightformer prosedural (aman offline) sehingga logam PBR tidak lagi dirender hitam; lampu fill netral; emissive seleksi yang lebih halus (tint cyan sebelumnya mengubah link oranye-pengaman menjadi salmon); graphite struktural yang lebih terang; panel pagar transparan tidak lagi menulis depth (sebelumnya dirender sebagai lempengan hitam buram); tiang pengaman kuning-keselamatan.
- Kualitas render adaptif: WebGL berbasis CPU (SwiftShader/llvmpipe/Basic Render, misalnya VM, CI, akselerasi GPU mati) melewatkan environment map dan bayangan serta memakai DPR 1. Frame rate SwiftShader 0.54 → 11.6 FPS (sebelum overhaul ini 4.7); jalur GPU tidak berubah di 60 FPS.
- Rute Analytics dan Optimization dimuat lazy: Recharts (113 kB gzip) tidak lagi diunduh di halaman pembuka.
- Flag masa depan React Router v7 diaktifkan (menghapus warning konsol).

**Verifikasi:** Rust 23/23 (clippy 1.100 bersih), Python 13/13 (ruff bersih), Vitest 14/14, Playwright E2E 5/5 (E2E-04 kini juga menyatakan tiga hasil objektif yang berbeda).
