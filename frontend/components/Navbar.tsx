import React from 'react';
import { Menu, Settings as SettingsIcon, LogOut, LayoutDashboard, UserRound, ShieldCheck } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface NavbarProps {
	title?: string;
	subtitle?: string;
	onOpenSidebar?: () => void;
	onOpenSettings?: () => void;
	showMenuButton?: boolean;
}

const Navbar: React.FC<NavbarProps> = ({
	title = 'STL Vault',
	subtitle,
	onOpenSidebar,
	onOpenSettings,
	showMenuButton = true
}) => {
	const { logout, user } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();

	const handleLogout = () => {
		logout();
		navigate('/login');
	};

	const navBtn = (path: string) =>
		`w-10 h-10 rounded-lg border flex items-center justify-center transition-colors ` +
		(location.pathname === path
			? 'bg-blue-600 border-blue-500 text-white'
			: 'bg-vault-800 hover:bg-vault-700 border-vault-700 text-slate-200');

	return (
		<header className="h-14 shrink-0 bg-vault-900 border-b border-vault-700 flex items-center px-3 gap-3">
			{showMenuButton && (
				<button
					type="button"
					onClick={onOpenSidebar}
					className="w-10 h-10 rounded-lg bg-vault-800 hover:bg-vault-700 border border-vault-700 flex items-center justify-center text-slate-200"
					aria-label="Open sidebar"
				>
					<Menu className="w-5 h-5" />
				</button>
			)}

			<div className="min-w-0 flex-1">
				<div className="text-sm font-semibold text-white truncate">{title}</div>
				{subtitle && <div className="text-xs text-slate-400 truncate">{subtitle}</div>}
			</div>

			<button
				type="button"
				onClick={() => navigate('/dashboard')}
				className={navBtn('/dashboard')}
				aria-label="Dashboard"
				title="Dashboard"
			>
				<LayoutDashboard className="w-5 h-5" />
			</button>

			<button
				type="button"
				onClick={() => navigate('/profile')}
				className={navBtn('/profile')}
				aria-label="Profile"
				title="Profile"
			>
				<UserRound className="w-5 h-5" />
			</button>

			{user?.is_superuser && (
				<button
					type="button"
					onClick={() => navigate('/admin')}
					className={navBtn('/admin')}
					aria-label="Admin Dashboard"
					title="Admin Dashboard"
				>
					<ShieldCheck className="w-5 h-5" />
				</button>
			)}

			<button
				type="button"
				onClick={onOpenSettings}
				className="w-10 h-10 rounded-lg bg-vault-800 hover:bg-vault-700 border border-vault-700 flex items-center justify-center text-slate-200"
				aria-label="Open settings"
			>
				<SettingsIcon className="w-5 h-5" />
			</button>

			<button
				type="button"
				onClick={handleLogout}
				className="w-10 h-10 rounded-lg bg-vault-800 hover:bg-vault-700 border border-vault-700 flex items-center justify-center text-slate-200"
				aria-label="Sign out"
				title="Sign out"
			>
				<LogOut className="w-5 h-5" />
			</button>
		</header>
	);
};

export default Navbar;
