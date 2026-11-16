> 🌐 [English](../../TEST_PLAN.md) | **Bahasa Indonesia**

# AoKira — Rencana Pengujian & Jaminan Kualitas

**Peran Dokumen:** Spesifikasi verifikasi kanonis yang mendefinisikan protokol unit, engine, kinematika, tabrakan, siklus produksi, kontrak API, frontend, end-to-end, regresi, dan baseline performa, beserta Matriks Uji Penerimaan otoritatif (`AC-01` sampai `AC-18`).
**Dokumen Kanonis Terkait:** [PRD.md](PRD.md), [SIMULATION_SPEC.md](SIMULATION_SPEC.md), [API_CONTRACT.md](API_CONTRACT.md), [DESIGN.md](DESIGN.md).

---

## 1. Strategi Pengujian & Tooling

| Layer | Test Runner & Framework | Cakupan |
|---|---|---|
| **Inti Simulasi Rust (`crates/aokira-engine`)** | `cargo test` + `wasm-pack test --headless --chrome` (smoke WASM opsional) | FK, IK, trajektori quintic, primitif tabrakan, state machine, determinisme, integral energi |
| **API Analytics Python (`apps/api`)** | `pytest` + `fastapi.testclient` / `httpx` | Validasi Pydantic, paritas KPI, deteksi bottleneck, kendala optimasi, envelope error |
| **Frontend (`apps/web`)** | `vitest` + `@testing-library/react` + `@testing-library/user-event` | Store, adapter protokol Worker, fallback klien API, panel UI, reduced-motion, fallback WebGL |
| **End-to-End (`apps/web` + WASM + API)** | `playwright` (`chromium`, desktop `1440x900` & mobile `390x844`) | Journey multi-halaman, pemasangan scene 3D, siklus pick-and-place penuh, degradasi offline |

*(Tidak ada metrik benchmark atau kelulusan yang boleh dilaporkan sebelum suite benar-benar dijalankan setelah edit implementasi.)*

---

## 2. Validasi Engine Simulasi Rust & Kinematika (`crates/aokira-engine`)

### 2.1 Forward Kinematics & Paritas Frame (`RUST-KIN-01..03`)
- **`RUST-KIN-01` (Pemeriksaan Analitik Pose Home)**: Dengan `q = [0°, 10°, 20°, 0°, 60°, 0°]`, verifikasi sumbu pendekatan TCP mengarah lurus ke bawah sepanjang `-Y_w` (`(0, -1, 0)_w` dalam `1e-6`) dan posisi pergelangan cocok dengan turunan trigonometri DH bentuk tertutup (`< 1e-6 m`).
- **`RUST-KIN-02` (Pemeriksaan Sendi Nol & Ekstrem)**: Uji `q = [0, 0, 0, 0, 0, 0]` (`TCP` horizontal ke depan sepanjang `-Z_w` pada `z_w = -(0.080 + 0.400 + 0.100 + 0.120) = -0.700 m`, `y_w = 0.450 + 0.340 + 0.420 + 0.050 = 1.260 m`) dan verifikasi `|det(R)| = 1.0`, ortogonalitas `||R^T R - I|| < 1e-9`.
- **`RUST-KIN-03` (Paritas WorldFrame)**: Konfirmasi kuaternion `BaseFrame -> WorldFrame` `(-0.5, 0.5, 0.5, 0.5)` menghasilkan koordinat pick/station/place yang persis sesuai harapan (`AC-05`).

### 2.2 Validasi Inverse Kinematics (`RUST-IK-01..04`)
- **`RUST-IK-01` (Target Workcell Kanonis)**: Selesaikan IK untuk keenam waypoint operasional (`Input Hover`, `Input Pick`, `Station Hover`, `Station Target`, `Output Hover`, `Output Place`); pastikan `||Δp|| <= 0.0005 m` (`0.5 mm`), `||Δr|| <= 0.005 rad`, dan semua `q_i ∈ [minAngleRad, maxAngleRad]` (`AC-06`).
- **`RUST-IK-02` (Round-Trip FK(IK(T)) == T)**: Pada `25` pose terjangkau deterministik di dalam envelope workcell, verifikasi `FK(IK(pose))` cocok dengan `pose` dalam toleransi.
- **`RUST-IK-03` (Target Luar yang Tak Terjangkau)**: Target `(2.50, 0.80, 0.00)` (melampaui jangkauan pergelangan `~0.903 m`); pastikan `Err(UNREACHABLE_TARGET)` dan konfirmasi vektor sendi robot yang sedang berjalan tetap sepenuhnya tidak berubah (`AC-07`).
- **`RUST-IK-04` (Target Terblokir Batas Sendi)**: Target yang membutuhkan pelanggaran `J1` atau `J2` di luar batas; pastikan error eksplisit dan state terjaga.

### 2.3 Perencanaan Trajektori (`RUST-TRAJ-01..03`)
- **`RUST-TRAJ-01` (Kontinuitas Batas)**: Verifikasi `q(0) = q_start`, `q(T) = q_end`, `dq(0) = dq(T) = 0`, `ddq(0) = ddq(T) = 0`.
- **`RUST-TRAJ-02` (Kepatuhan Kecepatan & Akselerasi)**: Sampel setiap `20 ms` pada semua segmen yang diskalakan oleh `robotSpeedScale ∈ [0.20, 1.50]` dan `robotAccelScale ∈ [0.20, 1.50]`; pastikan `|dq_i| <= v_eff_i + 1e-6` dan `|ddq_i| <= a_eff_i + 1e-6`, serta `q_i` dalam batas (`AC-08`).
- **`RUST-TRAJ-03` (Segmen Degenerat Delta-Nol)**: Konfirmasi `q_start == q_end` selesai dengan bersih tanpa `NaN` atau pembagian dengan nol.

---

## 3. Kasus Uji Tabrakan & Clearance (`RUST-COL-01..06`)

| ID Tes | Skenario | Hasil yang Diharapkan |
|---|---|---|
| **`RUST-COL-01`** | Trajektori pick-and-place nominal (Input -> Station -> Output) | `severity == NONE` di setiap tick `20 ms` sepanjang siklus (`minClearance > 0.025 m`) |
| **`RUST-COL-02`** | Siku/pergelangan diposisikan `15 mm` di atas dek `processing-station` | `severity == NEAR_COLLISION` (`0 < clearance <= 0.025 m`), memancarkan `NEAR_COLLISION_WARNING`, simulasi berlanjut |
| **`RUST-COL-03`** | Perintahkan pose sendi yang mengarahkan `link-4` / `gripper` ke rumah `input-conveyor` (`y < 0.720`) | `severity == COLLISION`, memancarkan `COLLISION_DETECTED`, state langsung beralih ke `FAULT` (`AC-09`) |
| **`RUST-COL-04`** | Lengan diayunkan ke batas `safety-fence` (`x = ±1.600` atau `z = ±1.200`) | `severity == COLLISION`, `pairB == "safety-fence-*"`, berhenti segera |
| **`RUST-COL-05`** | Workpiece yang dipegang (kubus `60 mm`) menabrak rangka stasiun saat transit rendah yang tidak valid | `severity == COLLISION` yang melibatkan primitif workpiece yang dipegang |
| **`RUST-COL-06`** | Gripper aktif menggenggam `WP-0001` (`GRIPPER_GRASPED`) | Kontak genggam yang disengaja dikecualikan; nol false-positive `COLLISION` atau `NEAR_COLLISION` |

---

## 4. Tes Siklus Produksi, Determinisme & State Machine (`RUST-PROD-01..06`)

- **`RUST-PROD-01` (Satu Siklus Selesai)**: Jalankan mode `SINGLE` hingga `COMPLETED`; verifikasi progres stage berurutan yang tepat (`IDLE -> DETECT_OBJECT -> APPROACH_PICK -> PICK_WORKPIECE -> TRANSFER_TO_STATION -> PROCESS_WORKPIECE -> PICK_FINISHED -> TRANSFER_TO_OUTPUT -> PLACE_WORKPIECE -> CYCLE_COMPLETE -> IDLE/COMPLETED`), `completedUnits == 1`, dan workpiece terkirim di `output-conveyor` (`AC-10`).
- **`RUST-PROD-02` (Determinisme Multi-Siklus)**: Eksekusi `FIXED_COUNT = 3` dua kali dengan `ScenarioConfig` identik (`seed = 42`), sekali tick demi tick (batch `1x20ms`) dan sekali dalam batch `5x20ms`; pastikan `SimulationSnapshot`, urutan `SimulationEvent[]`, dan `ProductionMetrics` identik bit demi bit (`AC-12`).
- **`RUST-PROD-03` (Kontrol Transport)**: Verifikasi `Start -> Pause -> Resume -> Stop -> Reset` menjaga state secara akurat selama `Pause` (jam/gerak tidak maju sama sekali) dan membersihkan event/workpiece dengan rapi saat `Reset` (`AC-11`).
- **`RUST-PROD-04` (Injeksi Fault & Pemulihan)**: Uji `PAYLOAD_EXCEEDED` (`workpieceMassKg = 5.5` jika diinjeksi secara internal / fixture uji yang di-clamp), `OBJECT_UNAVAILABLE`, `GRIPPER_FAILURE`, dan `ESTOP_ACTIVE`; verifikasi state `FAULT` memblokir gerak hingga `Reset`.
- **`RUST-PROD-05` (Monotonisitas Energi)**: Verifikasi `cumulativeEnergyWh` meningkat secara ketat selama tick aktif dan skalanya sesuai dengan `robotSpeedScale` dan `workpieceMassKg` yang lebih tinggi.
- **`RUST-PROD-06` (Regresi Golden Fixture)**: Bandingkan aliran event JSON dan ringkasan KPI yang dihasilkan untuk `Scenario A: Baseline` (`3` siklus) terhadap golden fixture yang di-commit `data/fixtures/baseline-3cycles.golden.json`. Urutan event, bilangan bulat, dan string harus cocok persis; bilangan non-bulat dalam `1e-12` relatif (perbedaan ULP libm lintas platform).
- **`RUST-PROD-07` (Nol Tabrakan di Seluruh Batas Parameter)**: Jalankan 3 siklus di semua 16 sudut kotak yang diizinkan API (kecepatan=akselerasi robot `0.20`/`1.50`, belt input `0.05`/`0.60`, belt output `0.05`/`0.60 m/s`, dwell `500`/`10000 ms`); setiap run harus selesai dengan nol event tabrakan. Menjaga interlock belt PLC input/output yang menjadi andalan kendala nol-tabrakan optimizer.

---

## 5. Tes Backend Python & Kontrak API (`apps/api/tests/`)

| ID Tes | Endpoint / Modul | Asersi |
|---|---|---|
| **`API-01`** | `GET /api/v1/health` | Mengembalikan `200`, `status == "ok"`, `apiVersion == "1.0.0"`, timestamp ISO UTC |
| **`API-02`** | `POST /api/v1/analytics/evaluate` | Menghitung ulang KPI dari `baseline-3cycles.golden.json`; `validation.isValid == true`, `clientServerDeltaPct < 0.01`, komponen `energyBreakdown` berjumlah `totalWh` (`AC-13`) |
| **`API-03`** | `POST /api/v1/analytics/evaluate` (Input Tidak Valid) | `seq` atau `simTimeMs` yang tidak monoton mengembalikan `400`/`422` dengan `ApiErrorResponse` terstruktur; `robotSpeedScale = 5.0` yang tidak valid mengembalikan `422` dengan `details` |
| **`API-04`** | `POST /api/v1/scenarios/compare` | Mengevaluasi Skenario `A`–`D`; meranking secara ketat sesuai `rankingObjective` (`MIN_CYCLE_TIME`, `MIN_ENERGY`, `BALANCED`) (`AC-14`) |
| **`API-05`** | `POST /api/v1/optimization/run` | Menghormati `OptimizationBounds`, `minThroughputUnitsPerHour`, dan aturan nol-tabrakan; `recommendedProjected` mengalahkan atau menyamai `baselineProjected` pada objektif (`AC-14`) |
| **`API-06`** | `POST /api/v1/optimization/run` (Infeasible) | Meminta throughput yang tak tercapai (`minThroughputUnitsPerHour = 100000`) mengembalikan `INFEASIBLE_OPTIMIZATION` dengan pesan diagnostik yang jelas |
| **`API-07`** | `analytics/validation.py` & `energy.py` | Unit test yang memverifikasi penolakan durasi negatif, penolakan `NaN`/`Inf`, dan paritas komponen energi dengan `SIMULATION_SPEC.md` |
| **`API-08`** | `analytics/surrogate.py` | Batas sendi/torsi/pose home surrogate sama dengan `aokira-workcell.v1.json` (sumber kebenaran tunggal) |
| **`API-09`** | `analytics/surrogate.py` | Waktu siklus dan energi per unit surrogate pada kondisi tunak dalam `2 %` dari golden fixture Rust |
| **`API-10`** | `analytics/optimization.py` | `MIN_CYCLE_TIME`, `MIN_ENERGY_PER_UNIT`, `BALANCED` memberi rekomendasi yang berbeda; `BALANCED` berada tepat di antara jangkar pada kedua metrik; `MIN_ENERGY_PER_UNIT` dalam `0.5 %` dari acuan global SciPy `differential_evolution`; batas dwell yang terkunci dihormati |

---

## 6. Tes Unit & Integrasi Frontend (`apps/web`)

- **`FE-01` (Adapter Jembatan Worker)**: Mock/jalankan `simulation.worker.ts` yang mengirim `INIT`, `LOAD_SCENARIO`, `START`, `STEP_TICKS`, `SOLVE_IK`, dan verifikasi pembaruan state store bertipe.
- **`FE-02` (Registry Komponen & Inspektor 6 Sendi)**: Memilih `robot-arm` memasang slider `J1`–`J6` yang dibatasi min/maks radian kanonis yang dikonversi ke derajat; jogging memperbarui `SET_JOINTS` (`AC-04`).
- **`FE-03` (Guard Analytics Tanpa Mock)**: Dengan riwayat event kosong, `Performance Analytics` menampilkan prompt kosong, bukan angka placeholder yang di-hardcode (`AC-12`).
- **`FE-04` (Degradasi Backend Offline)**: Simulasikan kegagalan jaringan / `503` pada `/api/v1/health`; pastikan `backendStatus === 'UNAVAILABLE'`, banner error tampil dengan rapi, dan tombol transport simulasi lokal tetap aktif (`AC-15`).
- **`FE-05` (Reduced Motion & Fallback WebGL)**: Mock `matchMedia('(prefers-reduced-motion: reduce)')` dan konteks WebGL yang hilang; verifikasi `WebGLFallbackView` merender skema SVG 2D yang tersinkron dengan `SimulationSnapshot` tanpa exception runtime (`AC-17`).

---

## 7. Verifikasi End-to-End & Responsif (Playwright)

- **`E2E-01` (Showcase Overview)**: Buka `/`, pastikan canvas dirender dengan dimensi tidak nol, nol error konsol, pembaruan status siklus aktif, dan CTA navigasi berfungsi (`AC-01`).
- **`E2E-02` (Inspeksi Digital Twin)**: Buka `/digital-twin`, picu preset kamera `Front`/`Side`/`Top`/`Isometric`, pilih komponen, toggle exploded view dan geometri tabrakan, verifikasi visibilitas inspektor 6 sendi (`AC-02`, `AC-03`, `AC-04`).
- **`E2E-03` (Siklus Penuh Simulation Lab -> Analytics)**: Buka `/simulation`, mulai `Single Cycle` pada kecepatan `2x`, tunggu `Cycle Completed` / `completedUnits >= 1`, buka `/analytics`, verifikasi `Total Units Produced >= 1` dan waktu siklus yang cocok (`AC-10`, `AC-11`, `AC-12`).
- **`E2E-04` (Alur Optimization Center)**: Dengan server uji FastAPI berjalan, bandingkan Skenario `A`–`D`, jalankan optimasi, muat skenario yang direkomendasikan ke `Simulation Lab` (`AC-13`, `AC-14`).
- **`E2E-05` (Layout Responsif Mobile)**: Jalankan pada viewport `390x844` di seluruh 5 rute dengan memverifikasi nol overflow horizontal dan navigasi/kontrol yang dapat diakses (`AC-16`).

---

## 8. Protokol Baseline Performa & Anggaran Target Awal

Karena timing runtime yang konkret bergantung pada GPU browser dan perangkat keras target, metrik performa **harus diukur di Phase 7** pada build yang sebenarnya, bukan diasumsikan di awal.

| Metrik | Anggaran Desain Awal (Akan Diukur sebagai Baseline di Phase 7) | Metode Pengukuran |
|---|---|---|
| **Frame Rate Viewport 3D** | Target `>= 60 FPS` stabil di desktop (`>= 30 FPS` daya-rendah/mobile) selama siklus kontinu | Chrome DevTools Performance / pengukuran frame Playwright selama run 30 detik |
| **Eksekusi Tick Rust/WASM** | Target `< 1.0 ms` per `step_tick` `20 ms` (menyisakan `> 95%` ruang gerak worker bahkan pada kecepatan `4x`) | Rust Criterion/bench atau `performance.now()` selama 1.000 tick |
| **Waktu Solusi IK** | Target `< 2.0 ms` kasus terburuk di 3 seed x 120 iterasi | Benchmark timing unit Rust |
| **Python `/analytics/evaluate`** | Target `< 100 ms` untuk payload run 1.000 event | Benchmark container lokal Pytest + HTTPX |
| **Python `/optimization/run`** | Target `< 1500 ms` untuk pencarian berkendala 120 evaluasi | Benchmark container lokal Pytest + HTTPX |
| **Bundle Produksi Web** | Target JS rute awal `< 450 KB` gzip (tidak termasuk rute lazy/WASM) | Laporan artefak build Vite (`dist/`) |

---

## 9. Matriks Uji Penerimaan (`AC-01` sampai `AC-18`)

| ID AC | Ringkasan Persyaratan | ID Tes Verifikasi | Gerbang Otomatis |
|---|---|---|---|
| **AC-01** | Halaman pembuka menampilkan workcell robot 3D dengan benar | `E2E-01` | Playwright |
| **AC-02** | Ke-10 komponen utama dapat dipilih | `FE-02`, `E2E-02` | Vitest + Playwright |
| **AC-03** | Orbit/pan/zoom + preset kamera berfungsi | `E2E-02` | Playwright |
| **AC-04** | 6 sendi dapat dikontrol secara independen dalam batas | `RUST-KIN-01`, `FE-02`, `E2E-02` | Cargo + Vitest + Playwright |
| **AC-05** | FK cocok dengan transform 3D visual | `RUST-KIN-01..03` | Cargo + Integrasi |
| **AC-06** | IK menyelesaikan target terjangkau secara akurat | `RUST-IK-01`, `RUST-IK-02` | Cargo |
| **AC-07** | Target tak terjangkau mengembalikan error terstruktur | `RUST-IK-03`, `RUST-IK-04` | Cargo + Vitest |
| **AC-08** | Trajektori menghormati batas sudut/kecepatan/akselerasi sendi | `RUST-TRAJ-01..03` | Cargo |
| **AC-09** | Deteksi tabrakan & near-collision pada skenario uji | `RUST-COL-01..06` | Cargo + E2E |
| **AC-10** | Siklus pick-and-place 8 stage penuh selesai | `RUST-PROD-01`, `E2E-03` | Cargo + Playwright |
| **AC-11** | Pause, Resume, Stop, Reset berfungsi dengan bersih | `RUST-PROD-03`, `E2E-03` | Cargo + Playwright |
| **AC-12** | Event simulasi mendorong KPI secara deterministik | `RUST-PROD-02`, `RUST-PROD-06`, `FE-03`, `E2E-03` | Cargo + Vitest + Playwright |
| **AC-13** | Analytics Python mengonsumsi run & memvalidasi metrik | `API-01..03`, `API-07..09` | Pytest |
| **AC-14** | Optimization Center membandingkan skenario & merekomendasikan konfigurasi | `API-04..06`, `E2E-04` | Pytest + Playwright |
| **AC-15** | UI menampilkan state fault & backend-unavailable dengan rapi | `RUST-PROD-04`, `FE-04` | Cargo + Vitest |
| **AC-16** | Layout responsif dapat dipakai di desktop & mobile | `E2E-05` | Playwright (`390x844`, `1440x900`) |
| **AC-17** | Reduced-motion & fallback WebGL terverifikasi | `FE-05` | Vitest + Playwright |
| **AC-18** | Build, suite tes & deployment terverifikasi end-to-end | Pipeline CI penuh + smoke Pages/Docker | GitHub Actions + Persetujuan Manual |
