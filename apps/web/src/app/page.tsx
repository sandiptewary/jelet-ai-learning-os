export default function Home() {
  return (
    <main className="min-h-screen bg-[#0B1020] text-white flex items-center justify-center">
      <section className="text-center px-6">
        <p className="text-blue-400 uppercase tracking-[0.3em] text-sm font-semibold">
          JELET AI LEARNING OS
        </p>

        <h1 className="mt-6 text-5xl md:text-7xl font-extrabold leading-tight">
          Master Concepts.
          <br />
          Crack JELET.
        </h1>

        <p className="mt-6 max-w-2xl mx-auto text-gray-400 text-lg">
          Your personal AI-powered learning system for concept mastery,
          adaptive practice, smart revision, and exam preparation.
        </p>

        <button className="mt-10 rounded-xl bg-blue-600 px-8 py-4 text-lg font-semibold hover:bg-blue-500 transition">
          Start Learning
        </button>
      </section>
    </main>
  );
}