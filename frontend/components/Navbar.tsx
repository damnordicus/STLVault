import React, { useState, useEffect } from 'react';
import { Menu, LogOut, X, House, Box } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { APP_NAME, NAV_OPTIONS } from '@/contexts/constants';

interface NavbarProps {
	title?: string;
	subtitle?: string;
	onOpenSidebar?: () => void;
	showMenuButton?: boolean;
}

const Navbar: React.FC<NavbarProps> = ({
	title = APP_NAME.full,
	subtitle,
	onOpenSidebar,
	showMenuButton = true
}) => {
	const { logout, user } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();

	// Mobile nav drawer state
	const [isNavOpen, setIsNavOpen] = useState(false);
	const [isNavMounted, setIsNavMounted] = useState(false);
	const [isNavVisible, setIsNavVisible] = useState(false);

	useEffect(() => {
		const transitionMs = 220;
		let timeoutId: number | undefined;

		if (isNavOpen) {
			setIsNavMounted(true);
			timeoutId = window.setTimeout(() => setIsNavVisible(true), 10);
		} else {
			setIsNavVisible(false);
			timeoutId = window.setTimeout(() => setIsNavMounted(false), transitionMs);
		}

		return () => {
			if (typeof timeoutId === 'number') window.clearTimeout(timeoutId);
		};
	}, [isNavOpen]);

	useEffect(() => {
		if (!isNavMounted) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setIsNavOpen(false);
		};
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			document.body.style.overflow = prevOverflow;
		};
	}, [isNavMounted]);

	const handleLogout = () => {
		logout();
		navigate('/login');
	};

	const handleNavClick = (path: string) => {
		navigate(path);
		setIsNavOpen(false);
	};

	const navBtn = (path: string) =>
		`group h-10 rounded-lg border flex items-center overflow-hidden transition-all duration-200 px-3 ` +
		(location.pathname === path
			? 'bg-blue-600 border-blue-500 text-white'
			: 'bg-vault-800 hover:bg-vault-700 border-vault-700 text-slate-200');

	const drawerNavBtn = (path: string) =>
		`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left transition-colors duration-150 ` +
		(location.pathname === path
			? 'bg-blue-600 text-white'
			: 'text-slate-200 hover:bg-vault-700');

	const visibleNavOptions = NAV_OPTIONS.filter((item) => !item.adminOnly || user?.is_superuser);

	return (
		<>
			<header className="h-14 shrink-0 bg-vault-900 border-b border-vault-700 flex items-center px-3 gap-3">
				{/* Left sidebar toggle (mobile) */}
				{showMenuButton && (
					<button
						type="button"
						onClick={onOpenSidebar}
						className="w-10 h-10 rounded-lg bg-vault-800 hover:bg-vault-700 border border-vault-700 flex items-center justify-center text-slate-200"
						aria-label="Open sidebar"
					>
						<Box className="w-5 h-5" />
					</button>
				)}

				<div className="min-w-0 flex-1">
					<div className="text-base font-bold text-white truncate tracking-wide">{title}</div>
				</div>

				{/* Desktop nav buttons — hidden on mobile */}
				<div className="hidden lg:flex items-center gap-2">
					{visibleNavOptions.map((item) => (
						<button
							key={item.link}
							type="button"
							onClick={() => navigate(item.link)}
							className={navBtn(item.link)}
							aria-label={item.label}
						>
							<span className="overflow-hidden whitespace-nowrap max-w-[9rem]">
								{item.label}
							</span>
						</button>
					))}

					<button
						type="button"
						onClick={handleLogout}
						className="w-10 h-10 rounded-lg bg-vault-800 hover:bg-vault-700 border border-vault-700 flex items-center justify-center text-slate-200"
						aria-label="Sign out"
						title="Sign out"
					>
						<LogOut className="w-5 h-5" />
					</button>
				</div>

				{/* Mobile nav toggle — hidden on desktop */}
				<button
					type="button"
					onClick={() => setIsNavOpen(true)}
					className="lg:hidden w-10 h-10 rounded-lg bg-vault-800 hover:bg-vault-700 border border-vault-700 flex items-center justify-center text-slate-200"
					aria-label="Open navigation"
				>
					<Menu className="w-5 h-5" />
				</button>
			</header>

			{/* Mobile nav drawer — right slide-over */}
			{isNavMounted && (
				<div className="fixed inset-0 z-[80] lg:hidden">
					{/* Backdrop */}
					<div
						className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 ${
							isNavVisible ? 'opacity-100' : 'opacity-0'
						}`}
						onClick={() => setIsNavOpen(false)}
					/>

					{/* Drawer panel */}
					<div
						className={`absolute inset-y-0 right-0 w-[75vw] max-w-[300px] bg-vault-900 border-l border-vault-700 flex flex-col transform transition-transform duration-200 ease-out ${
							isNavVisible ? 'translate-x-0' : 'translate-x-full'
						}`}
					>
						{/* Drawer header */}
						<div className="h-14 flex items-center justify-between px-4 border-b border-vault-700 shrink-0">
							<span className="font-bold text-white tracking-wide">{APP_NAME.short}</span>
							<button
								type="button"
								onClick={() => setIsNavOpen(false)}
								className="w-9 h-9 rounded-lg bg-vault-800 hover:bg-vault-700 border border-vault-700 flex items-center justify-center text-slate-200"
								aria-label="Close navigation"
							>
								<X className="w-4 h-4" />
							</button>
						</div>

						{/* Nav options */}
						<nav className="flex-1 overflow-y-auto p-3 space-y-1">
							{visibleNavOptions.map((item) => {
								const Icon = item.icon;
								return (
									<button
										key={item.link}
										type="button"
										onClick={() => handleNavClick(item.link)}
										className={drawerNavBtn(item.link)}
									>
										<Icon className="w-5 h-5 shrink-0" />
										<span className="text-sm font-medium">{item.label}</span>
									</button>
								);
							})}
						</nav>

						{/* Logout at bottom */}
						<div className="p-3 border-t border-vault-700 shrink-0">
							<button
								type="button"
								onClick={handleLogout}
								className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left text-slate-200 hover:bg-vault-700 transition-colors duration-150"
							>
								<LogOut className="w-5 h-5 shrink-0" />
								<span className="text-sm font-medium">Sign out</span>
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
};

export default Navbar;
