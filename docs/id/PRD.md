> 🌐 [English](../../PRD.md) | **Bahasa Indonesia**

# AoKira — Product Requirements Document (PRD)

**Identitas Produk:** `AoKira` — *Industrial Robotic Workcell Digital Twin*
**Tagline:** *Design. Simulate. Optimize. Operate.*
**Peran Dokumen:** Sumber kebenaran kanonis untuk visi produk, persona pengguna, cakupan fungsional, prioritas fitur, pengecualian eksplisit, persyaratan non-fungsional, dan kriteria penerimaan (`AC-01` sampai `AC-18`).
**Status:** Terkunci untuk Implementasi (Baseline Dokumentasi Phase 0)

---

## 1. Visi Produk & Pernyataan Masalah

### 1.1 Visi
`AoKira` adalah platform digital twin workcell robotik industri 3D interaktif di dalam browser. Alih-alih menjadi etalase model 3D yang pasif atau dasbor statis dengan angka tiruan, `AoKira` mengoperasikan workcell manufaktur cerdas yang terpadu dan deterministik, di mana visualisasi 3D, kinematika dan simulasi tabrakan Rust/WebAssembly secara real-time, pencatatan event produksi, serta analytics dan optimasi skenario berbasis Python semuanya berasal dari satu inti simulasi.

### 1.2 Pernyataan Masalah
Mengevaluasi workcell pick-and-place otomatis biasanya membutuhkan suite offline-programming (OLP) proprietary yang mahal, beban penyiapan yang tinggi, atau alat yang terfragmentasi di mana kinematika 3D, estimasi waktu siklus, pemeriksaan tabrakan, dan optimasi throughput berada di spreadsheet dan visualizer terpisah yang tidak terhubung. Sebaliknya, demo web 3D yang ringan tidak memiliki ketelitian kinematik, validasi tabrakan, jejak event deterministik, dan analytics produksi yang dapat ditindaklanjuti.

`AoKira` menjembatani celah ini sebagai demonstrator rekayasa yang mudah diakses dan berdiri sendiri: pengguna dapat memeriksa workcell robot articulated 6 sumbu generik dalam 3D, menguji batas sendi dan inverse kinematics, mendeteksi tabrakan sebelum menjalankan siklus, mengamati transisi state produksi secara real-time, mengukur KPI turunan event, dan menjalankan optimasi multi-skenario berkendala di Python.

### 1.3 Batas Wajib Non-Keselamatan & Hanya-Simulasi
`AoKira` sepenuhnya adalah **demonstrator hanya-simulasi** yang ditenagai model sintetis, deterministik, dan dapat dikonfigurasi. Ia **tidak boleh** disajikan, di-deploy, atau digunakan sebagai:
- Perangkat lunak kontrol robot industri atau firmware gerak di dunia nyata.
- Middleware integrasi perangkat keras PLC, fieldbus, atau ROS 2.
- Sistem validasi keselamatan industri tersertifikasi (ISO 10218 / ISO/TS 15066).
- Pengukuran listrik utilitas yang akurat atau telemetri pabrik langsung.

---

## 2. Tujuan Produk & Metrik Keberhasilan

| ID Tujuan | Tujuan | Target Hasil yang Terukur (Diverifikasi di Phase 7) |
|---|---|---|
| **OBJ-01** | Menghadirkan pengalaman digital twin interaktif yang berpusat pada 3D | Semua komponen workcell utama dapat dipilih, diinspeksi, diisolasi, dan dikontrol dalam 3D dengan kamera preset dan orbit (`AC-01`–`AC-03`). |
| **OBJ-02** | Mendasarkan semua gerakan pada kinematika komputasional & pemeriksaan tabrakan yang autentik | Forward/inverse kinematics 6-DOF, trajektori quintic dalam batas sendi, dan pemeriksaan tabrakan capsule/bounding-volume dieksekusi di Rust/WASM (`AC-04`–`AC-09`). |
| **OBJ-03** | Menyatukan event simulasi dengan KPI produksi | 100% metrik analytics dihitung langsung dari aliran event simulasi deterministik, bukan dari nilai dasbor statis/tiruan (`AC-10`–`AC-12`). |
| **OBJ-04** | Memungkinkan optimasi multi-skenario berkendala & penemuan bottleneck | Engine Python FastAPI membandingkan konfigurasi baseline dan varian serta mengidentifikasi bottleneck dan parameter yang direkomendasikan (`AC-13`, `AC-14`). |
| **OBJ-05** | Menjamin ketahanan offline dan degradasi yang anggun | Inspeksi workcell 3D inti dan simulasi produksi Rust/WASM tetap berfungsi penuh ketika backend Python tidak tersedia (`AC-15`). |
| **OBJ-06** | Memenuhi standar lintas perangkat, aksesibilitas, dan kualitas build | Layout desktop/mobile yang responsif, dukungan `prefers-reduced-motion`, tampilan fallback WebGL, dan verifikasi CI/tes yang bersih (`AC-16`–`AC-18`). |

*(Catatan: Anggaran kuantitatif untuk latensi, FPS, dan toleransi solver ditetapkan dan diukur terhadap baseline perangkat keras di [TEST_PLAN.md](TEST_PLAN.md); tidak ada benchmark yang belum terukur yang dikarang.)*

---

## 3. Pengguna Target & Persona

| Persona | Profil | Tujuan Utama di AoKira | Tampilan Utama yang Dipakai |
|---|---|---|---|
| **Insinyur Manufaktur / Otomasi** | Merancang atau mengevaluasi konsep workcell pick-and-place | Memeriksa keterjangkauan robot, menguji batas sendi, memvalidasi clearance tabrakan, menyetel kecepatan, meminimalkan waktu siklus | `Digital Twin`, `Simulation Lab`, `Optimization Center` |
| **Pengembang / Mahasiswa Robotika & Simulasi** | Mempelajari kinematika manipulator, perencanaan trajektori, dan digital twin berbasis event | Mengamati konsistensi FK/IK, memverifikasi profil gerak quintic, memeriksa primitif tabrakan dan log state machine | `Digital Twin`, `Simulation Lab` |
| **Analis Operasi / Pabrik** | Meninjau throughput, utilisasi, downtime, estimasi energi, dan bottleneck | Menganalisis tren KPI siklus demi siklus, membandingkan skenario "what-if", membenarkan penyetelan parameter | `Performance Analytics`, `Optimization Center`, `Overview` |

---

## 4. User Journey Inti

### Journey 1 — Penemuan Sel yang Terpandu (`Overview` -> `Digital Twin`)
1. Pengguna mendarat di `Overview`, mengamati workcell 3D sinematik langsung yang menjalankan showcase pick-and-place beranimasi bersama kesehatan sistem real-time dan ringkasan produksi aktif.
2. Pengguna mengklik CTA utama untuk masuk ke `Digital Twin`.
3. Pengguna mengorbit di sekitar workcell, memicu preset kamera (`Front`, `Side`, `Top`, `Isometric`), memilih lengan robot 6 sumbu untuk memeriksa 6 sendi dan parameternya secara individual, mengaktifkan exploded view, mengisolasi subassembly, dan men-toggle geometri tabrakan serta sumbu koordinat.

### Journey 2 — Perencanaan Gerak & Eksekusi Produksi (`Simulation Lab`)
1. Pengguna membuka `Simulation Lab` dan memilih mode `Single Cycle` atau `Continuous` dengan kuantitas produksi target (default laju target `60 unit/jam`).
2. Pengguna menyesuaikan kecepatan gerak robot, kecepatan konveyor, atau kecepatan playback simulasi, atau men-toggle secara manual gripper buka/tutup dan pose uji sendi.
3. Pengguna mengklik `Start`; state machine produksi 8 stage berjalan secara deterministik di Web Worker Rust/WASM, mengalirkan transform sendi, posisi workpiece, status gripper, dan event bertimestamp.
4. Jika terjadi target tak terjangkau, pelanggaran batas sendi, kegagalan gripper, atau tabrakan, state machine masuk ke state fault/error yang eksplisit, menyorot geometri penyebab di 3D, mencatat event diagnostik, dan memungkinkan pemulihan lewat `Reset`.

### Journey 3 — Evaluasi KPI Berbasis Event (`Performance Analytics`)
1. Pengguna membuka `Performance Analytics` selama atau setelah run simulasi.
2. Dasbor menampilkan KPI yang diturunkan sepenuhnya dari riwayat event simulasi aktif: total unit yang diproduksi, unit/jam, waktu siklus rata-rata, utilisasi robot, utilisasi konveyor, waktu idle, downtime, jumlah tabrakan, estimasi konsumsi energi, dan efisiensi produksi.
3. Jika layanan analytics Python dapat dijangkau, diagnostik bottleneck, rincian energi, dan validasi konsistensi yang dihitung backend memperkaya tampilan; jika offline, ringkasan simulasi sisi klien tetap terlihat sementara panel khusus backend dengan jelas menampilkan status `Unavailable` tanpa crash.

### Journey 4 — Perbandingan Multi-Skenario & Optimasi (`Optimization Center`)
1. Pengguna memuat skenario baseline (`Scenario A: Baseline`) bersama konfigurasi alternatif (misalnya `Scenario B: Faster Robot Motion`, `Scenario C: Optimized Trajectory`, `Scenario D: Adjusted Conveyor Speed`) atau mendefinisikan batas parameter kustom.
2. Pengguna memicu analisis skenario batch dan optimasi berkendala lewat layanan Python FastAPI.
3. Sistem mengevaluasi waktu siklus, throughput, waktu idle, estimasi energi, jumlah tabrakan, dan bottleneck di seluruh skenario, lalu menyajikan tabel/grafik perbandingan berperingkat dan konfigurasi yang direkomendasikan yang dapat dimuat kembali ke `Simulation Lab`.

---

## 5. Persyaratan Fungsional

### 5.1 Konfigurasi Fisik Workcell (Baseline Terkunci)
Satu workcell kanonis yang dimodelkan secara konsisten di semua tampilan terdiri dari:
1. Lengan robotik articulated 6 sumbu generik (didefinisikan sendiri; tanpa imitasi merek robot OEM proprietary).
2. Gripper paralel dua jari.
3. Konveyor input (default `0.20 m/s`).
4. Konveyor output (default `0.20 m/s`).
5. Stasiun pemrosesan (fixture + dwell pemrosesan tersimulasi).
6. Workpiece (bagian sintetis `60 x 60 x 60 mm`, batas payload tersimulasi `<= 5 kg`).
7. Pedestal robot.
8. Perimeter pagar pengaman.
9. Stasiun emergency stop.
10. Sensor kehadiran dan beacon indikator status.

Koordinat, dimensi, parameter DH, dan batas sendi yang terperinci ditetapkan secara kanonis di [SIMULATION_SPEC.md](SIMULATION_SPEC.md) dan diberi tipe di [DATA_MODEL.md](DATA_MODEL.md).

### 5.2 Tampilan Aplikasi & Persyaratan Fitur

| ID | Area Fitur | Deskripsi Persyaratan | Prioritas |
|---|---|---|---|
| **FR-OV-01** | Landing Overview | Canvas workcell 3D hero dengan orbit kamera sinematik dan siklus manufaktur beranimasi yang aktif (bukan halaman landing generik). | P0 (Wajib) |
| **FR-OV-02** | Status & Navigasi Overview | Indikator status sistem langsung (engine WASM, keterjangkauan API backend), metrik ringkasan produksi langsung, navigasi cepat, dan CTA langsung ke `Digital Twin` dan `Simulation Lab`. | P0 (Wajib) |
| **FR-DT-01** | Navigasi 3D & Preset | Kontrol orbit, pan, zoom ditambah preset kamera: `Front`, `Side`, `Top`, dan `Isometric`. | P0 (Wajib) |
| **FR-DT-02** | Inspeksi Komponen | Seleksi raycast interaktif untuk seluruh 10 komponen workcell utama, membuka Panel Informasi Komponen dengan identitas, peran, dimensi, dan state langsung. | P0 (Wajib) |
| **FR-DT-03** | Inspektor 6 Sendi Robot | Memilih lengan robot menampilkan keenam sendi (`J1`–`J6`) secara individual dengan sudut saat ini, batas sudut min/maks, batas kecepatan/akselerasi, sumbu, dan slider jog manual interaktif. | P0 (Wajib) |
| **FR-DT-04** | Visibilitas Scene & Diagnostik | Tampilkan/sembunyikan komponen individual, isolasi komponen terpilih, slider exploded view, toggle sumbu koordinat/grid, toggle label & indikator sensor, inspeksi bounding volume tabrakan, dan reset tampilan/pose workcell. | P0 (Wajib) |
| **FR-SL-01** | Kontrol Playback Simulasi | Kontrol `Start`, `Pause`, `Resume`, `Stop`, `Reset` dengan jam simulasi deterministik `20 ms` yang tidak bergantung pada FPS browser. | P0 (Wajib) |
| **FR-SL-02** | Mode Siklus & Penyetelan | Pilih produksi `Single Cycle` atau `Continuous`; konfigurasikan kuantitas produksi target, pengali kecepatan playback simulasi, kecepatan konveyor, skala kecepatan gerak robot, dan uji manual gripper buka/tutup. | P0 (Wajib) |
| **FR-SL-03** | Visibilitas Proses 8 Stage | Tampilan real-time stage aktif (`Input Conveyor` -> `Object Detection` -> `Robot Approaches` -> `Pick Workpiece` -> `Move to Processing Station` -> `Processing / Assembly` -> `Pick Finished Workpiece` -> `Move to Output Conveyor` -> `Place Workpiece` -> `Cycle Completed`) dan log event bertimestamp. | P0 (Wajib) |
| **FR-SL-04** | Umpan Balik Fault, IK & Tabrakan | Umpan balik visual dan tekstual yang jelas untuk tabrakan, peringatan near-collision, target Cartesian tak terjangkau, pelanggaran batas sendi, objek hilang, dan kegagalan gripper. | P0 (Wajib) |
| **FR-PA-01** | KPI Turunan Event | Hitung dan tampilkan: Total Units Produced, Units/Hour, Average Cycle Time, Robot Utilization, Conveyor Utilization, Idle Time, Downtime, Collision Events, Estimated Energy Consumption, dan Production Efficiency — sepenuhnya dari log event simulasi. | P0 (Wajib) |
| **FR-PA-02** | Riwayat Produksi & Grafik | Visualisasi deret waktu dan per-siklus (tren throughput, rincian waktu siklus, utilisasi state, estimasi energi) ditambah indikator validasi konsistensi backend. | P1 (Sebaiknya) |
| **FR-OC-01** | Perbandingan Multi-Skenario | Buat, kelola, dan bandingkan skenario baseline dan varian (misalnya baseline, gerak robot lebih cepat, trajektori teroptimasi, kecepatan konveyor disesuaikan) pada waktu siklus, throughput, waktu idle, estimasi energi, jumlah tabrakan, dan bottleneck. | P0 (Wajib) |
| **FR-OC-02** | Optimasi Berkendala | Picu optimasi Python FastAPI untuk mencari kombinasi parameter valid di bawah kendala sendi, clearance tabrakan, dan payload; tampilkan konfigurasi yang direkomendasikan dan terapkan ke `Simulation Lab`. | P0 (Wajib) |
| **FR-SYS-01** | Degradasi yang Anggun | Ketika backend Python FastAPI tidak dapat dijangkau, pertahankan visualisasi 3D dan simulasi Rust/WASM tetap berjalan normal sambil menampilkan state `Backend Unavailable` yang eksplisit pada aksi analytics/optimasi yang bergantung pada Python. | P0 (Wajib) |

### 5.3 Prioritas Fitur (Ringkasan MoSCoW)
- **Must Have (`P0`)**: Semua 5 rute, workcell 3D dengan 10 komponen yang dapat dipilih, kontrol 6 sendi + FK/IK, perencanaan trajektori ruang sendi quintic, deteksi tabrakan capsule/AABB, state machine deterministik 8 stage, log event, KPI turunan event, perbandingan skenario, endpoint optimasi Python, state offline/unavailable, reduced-motion, fallback WebGL.
- **Should Have (`P1`)**: Template skenario preset (`A`–`D`), laporan perbandingan JSON/CSV skenario yang dapat diekspor, overlay jejak jalur trajektori visual di 3D.
- **Could Have (`P2`)**: Pustaka skenario lokal-browser tersimpan (`localStorage`), gizmo waypoint Cartesian interaktif di `Simulation Lab`.
- **Won't Have (Rilis Ini)**: Lihat Bagian 6.

---

## 6. Batas Cakupan & Pengecualian Eksplisit

| Termasuk dalam Cakupan | Dikecualikan Secara Eksplisit dari Cakupan |
|---|---|
| Model robot articulated 6 sumbu generik | Replikasi CAD/firmware robot merek proprietary atau kontrol perangkat keras robot sungguhan |
| Gripper paralel dua jari tersimulasi | Kontrol gripper servo dengan umpan balik gaya atau I/O PLC pneumatik |
| Sel produksi pick-and-place (8 stage) | Simulasi discrete-event multi-sel / seluruh pabrik |
| Konveyor input & output + stasiun pemrosesan | Routing multi-mesin yang kompleks, AGV, atau logistik gudang |
| Deteksi tabrakan bounding-volume & capsule | Engine fisika rigid-body / FEM umum yang dibangun dari nol |
| Perencanaan gerak ruang sendi quintic & IK | Perencana jalur penghindar rintangan RRT*/PRM kelas industri |
| Event simulasi sintetis dan deterministik | Telemetri pabrik nyata, OPC-UA, MQTT, atau integrasi PLC/ROS 2 |
| Estimasi konsumsi energi rekayasa | Pengukuran listrik tersertifikasi atau simulasi termal |
| Browser pengguna tunggal + API analytics REST stateless | Autentikasi, login, RBAC, workspace cloud multi-pengguna, penagihan, deployment IoT |

---

## 7. Persyaratan Non-Fungsional

| Kategori | Persyaratan | Referensi Kanonis |
|---|---|---|
| **Determinisme** | State awal, seed, dan konfigurasi yang identik harus menghasilkan transisi state simulasi, timestamp, dan metrik yang identik di berbagai run, berapa pun frame rate klien. | [SIMULATION_SPEC.md](SIMULATION_SPEC.md) |
| **Sumber Kebenaran Tunggal** | Geometri link robot, batas sendi, dan dimensi layout workcell harus dimuat dari satu definisi konfigurasi kanonis yang dipakai bersama oleh Rust/WASM dan TypeScript/Three.js. | [DATA_MODEL.md](DATA_MODEL.md) |
| **Pemisahan Thread** | Tick simulasi langkah-tetap dan komputasi IK/tabrakan yang berat harus dieksekusi di dalam Web Worker (`Rust/WASM`), tidak pernah memblokir thread render/UI utama React. | [ARCHITECTURE.md](ARCHITECTURE.md) |
| **Responsivitas & Aksesibilitas** | Layout desktop-first dengan tampilan tablet/mobile yang dapat digunakan; navigasi keyboard, label ARIA, angka tabular, dukungan `prefers-reduced-motion`, dan UI fallback saat WebGL tidak tersedia yang bersih. | [DESIGN.md](DESIGN.md) |
| **Validasi & Keamanan API** | Semua request/response TypeScript <-> Python divalidasi ketat lewat skema Pydantic v2 dan diberi versi di bawah `/api/v1`. | [API_CONTRACT.md](API_CONTRACT.md) |
| **Keandalan & Pengujian** | Tes unit, integrasi, kontrak API, dan end-to-end otomatis yang mencakup kinematika, kasus tabrakan, determinisme state machine, dan state UI. | [TEST_PLAN.md](TEST_PLAN.md) |

---

## 8. Kriteria Penerimaan (Registry ID Kanonis)

Setiap kriteria di bawah wajib dipenuhi sebelum pengiriman akhir dan terpetakan langsung ke suite verifikasi di [TEST_PLAN.md](TEST_PLAN.md).

| ID | Kriteria | Pemilik Verifikasi Utama |
|---|---|---|
| **AC-01** | Halaman landing (`Overview`) merender workcell robot 3D secara akurat dengan showcase beranimasi aktif. | Frontend / E2E |
| **AC-02** | Ke-10 komponen workcell utama dapat dipilih di 3D dan diinspeksi di panel info. | Frontend / E2E |
| **AC-03** | Kontrol kamera (orbit, pan, zoom) dan preset (`Front`, `Side`, `Top`, `Isometric`) beroperasi dengan bersih. | Frontend / E2E |
| **AC-04** | Lengan robot menyediakan 6 sendi yang dapat dikontrol secara independen (`J1`–`J6`) dengan menghormati batas yang ditentukan. | Rust + Frontend |
| **AC-05** | Pose forward kinematics yang dihitung Rust/WASM cocok dengan transform sendi/end-effector visual Three.js. | Rust + Integrasi |
| **AC-06** | Inverse kinematics konvergen secara akurat untuk target workcell terjangkau yang valid. | Unit Rust + Integrasi |
| **AC-07** | Target Cartesian tak terjangkau mengembalikan error terstruktur eksplisit tanpa merusak state robot. | Unit Rust + UI |
| **AC-08** | Trajektori yang dihasilkan tidak pernah melanggar batas sudut, kecepatan, atau akselerasi sendi. | Unit Rust |
| **AC-09** | Deteksi tabrakan dan near-collision terpicu secara andal pada skenario uji tabrakan yang ditentukan. | Unit Rust + UI |
| **AC-10** | Siklus produksi pick-and-place 8 stage penuh dieksekusi hingga selesai dengan perpindahan workpiece. | Rust + E2E |
| **AC-11** | Simulasi mendukung `Start`, `Pause`, `Resume`, `Stop`, dan `Reset` dengan bersih dalam mode tunggal dan kontinu. | Worker + E2E |
| **AC-12** | Log event simulasi secara deterministik menghasilkan metrik KPI yang konsisten (nol KPI tiruan statis). | Rust + Frontend + Python |
| **AC-13** | Layanan analytics Python FastAPI mengonsumsi event/payload run simulasi dan mengembalikan pemeriksaan KPI, energi, dan konsistensi yang valid. | Python Pytest + Integrasi |
| **AC-14** | Optimization Center membandingkan beberapa skenario dan mengembalikan rekomendasi berkendala yang valid. | Python Pytest + E2E |
| **AC-15** | UI menyajikan fault simulasi (tabrakan/IK/gripper) dan state backend `Unavailable` dengan jelas tanpa membuat simulasi inti crash. | Frontend + E2E |
| **AC-16** | Layout tetap dapat digunakan di viewport desktop dan mobile/tablet yang responsif. | Frontend / E2E |
| **AC-17** | Perilaku `prefers-reduced-motion` dan tampilan fallback WebGL yang tidak crash diimplementasikan dan diverifikasi. | Frontend / E2E |
| **AC-18** | Build produksi, suite tes otomatis lintas TS/Rust/Python, dan verifikasi deployment GitHub Pages + Docker lulus. | CI / Gerbang Pengiriman |

---

## 9. Tata Kelola Keputusan: Terkunci vs. Default vs. Asumsi vs. Pertanyaan Terbuka

| Klasifikasi | Keputusan yang Dicakup | Aturan Otoritas / Tinjauan |
|---|---|---|
| **Keputusan Terkunci** | Identitas merek (`AoKira`), batas hanya-simulasi, 5 rute, 10 komponen workcell, lengan 6 sumbu generik, siklus 8 stage, pemisahan 3 tier `TypeScript/R3F + Rust/WASM + Python/FastAPI`, sistem warna `#0B0F14`–`#EF4444`, topologi GitHub Pages + backend container, `AC-01`–`AC-18` | Tidak dapat diubah tanpa persetujuan eksplisit pengguna ([constraints.md](constraints.md)). |
| **Default Implementasi yang Wajar** | Dimensi link DH & batas sendi (`SIMULATION_SPEC.md`), koordinat dunia workcell, DLS `lambda = 0.025` / `maxIterations = 120`, ambang near-collision `25 mm`, aktuasi gripper `300 ms`, dwell default `2500 ms`, koefisien model energi, timeout HTTP (`3s`/`10s`/`20s`) | Dikunci di `DATA_MODEL.md` / `SIMULATION_SPEC.md` / `API_CONTRACT.md` agar agen implementasi tidak menebak; dapat disetel lewat konfigurasi skenario atau pembaruan spesifikasi terdokumentasi jika kalibrasi mengharuskannya. |
| **Asumsi Rekayasa** | Pengguna target menjalankan browser modern dengan WebAssembly + Web Worker; payload HTTP analytics tetap `<= 5 MB`; state browser pengguna tunggal tidak memerlukan persistensi database server; allowlist CORS cukup untuk akses API demo stateless | Divalidasi lewat tes Phase 4–7. |
| **Keputusan Terbuka (Ditunda ke Deployment / Phase 7–8)** | (1) Angka baseline performa perangkat keras konkret yang diukur di Phase 7 (`TEST_PLAN.md` Bagian 8); (2) Pilihan penyedia hosting container eksternal untuk `apps/api` (`VITE_API_BASE_URL`) ketika di-deploy di luar Docker localhost; (3) Otorisasi push/deploy eksplisit dari pengguna di Phase 8 | **Tidak** memblokir implementasi lokal, pengujian, atau persiapan GitHub Pages pada Phase 1–7. |
