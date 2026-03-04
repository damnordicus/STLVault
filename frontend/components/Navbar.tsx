import React from 'react';
import { Menu, LogOut } from 'lucide-react';
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

	const handleLogout = () => {
		logout();
		navigate('/login');
	};

	const navBtn = (path: string) =>
		`group h-10 rounded-lg border flex items-center overflow-hidden transition-all duration-200 px-3 ` +
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

			{NAV_OPTIONS.filter((item) => !item.adminOnly || user?.is_superuser).map((item) => {
				const Icon = item.icon;
				return(
					<button
						key={item.link}
						type="button"
						onClick={() => navigate(item.link)}
						className={navBtn(item.link)}
						aria-label={item.label}
					>
						<span className="w-5 h-5 flex items-center justify-center flex-shrink-0 transition-all duration-200 ease-in-out group-hover:w-0 group-hover:opacity-0 overflow-hidden">
							<Icon className="w-5 h-5 flex-shrink-0" />
						</span>
						<span className="max-w-0 opacity-0 overflow-hidden whitespace-nowrap transition-all duration-200 ease-in-out group-hover:max-w-[8rem] group-hover:opacity-100">
							{item.label}
						</span>
					</button>
				)
			})}


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
