export default function Navbar() {
    return (
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0B1020]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <h1 className="text-lg font-bold tracking-wider text-white">
            JELET AI
          </h1>
  
          <div className="flex items-center gap-8 text-sm text-slate-300">
            <a href="#">Learn</a>
            <a href="#">Practice</a>
            <a href="#">Mock Test</a>
            <a href="#">AI Tutor</a>
            <a href="#">Progress</a>
          </div>
  
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500">
            Login
          </button>
        </div>
      </nav>
    );
  }