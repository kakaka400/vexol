import { usePathname } from 'next/navigation';
import { BookOpen, Clapperboard, Instagram, Linkedin, Radar, Twitter, Wand2 } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useSession } from '@/lib/auth-client';
import {
  blogPath,
  competitorsPath,
  isLinkedinPath,
  isTiktokPath,
  isTwitterPath,
  linkedinPath,
  tiktokPath,
  socialPath,
  studioPath,
  twitterPath,
} from '@/utils/paths';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from '@/components/ui/sidebar';
import SidebarNavItem from './SidebarNavItem';

export default function SidebarGrowthNav({ projectKey }: { projectKey: string | null }) {
  const pathname = usePathname();
  const { can } = usePermissions();
  const { data: session } = useSession();
  const isGod = session?.user?.role === 'god';

  const showSocial = can('social', 'read');
  const showCompetitors = can('competitors', 'read');
  const showStudio = can('studio', 'read');
  const showTwitter = can('twitter', 'read');
  const showLinkedin = can('linkedin', 'read');
  const showTiktok = can('tiktok', 'read');
  const showAny =
    showSocial || showTwitter || showLinkedin || showTiktok || showCompetitors || showStudio;
  if (!showAny && !isGod) return null;
  const onTwitter = isTwitterPath(pathname);
  const onLinkedin = isLinkedinPath(pathname);
  const onTiktok = isTiktokPath(pathname);

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Growth</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {showSocial && (
            <SidebarNavItem
              href={projectKey ? socialPath(projectKey) : '#'}
              icon={Instagram}
              label="Social"
              active={pathname.includes('/social') && !onTwitter && !onLinkedin && !onTiktok}
              disabled={!projectKey}
            />
          )}
          {showTwitter && (
            <SidebarNavItem
              href={projectKey ? twitterPath(projectKey) : '#'}
              icon={Twitter}
              label="Twitter"
              active={onTwitter}
              disabled={!projectKey}
            />
          )}
          {showTiktok && (
            <SidebarNavItem
              href={projectKey ? tiktokPath(projectKey) : '#'}
              icon={Clapperboard}
              label="TikTok"
              active={onTiktok}
              disabled={!projectKey}
            />
          )}
          {showLinkedin && (
            <SidebarNavItem
              href={projectKey ? linkedinPath(projectKey) : '#'}
              icon={Linkedin}
              label="LinkedIn"
              active={onLinkedin}
              disabled={!projectKey}
            />
          )}
          {isGod && (
            <SidebarNavItem
              href={projectKey ? blogPath(projectKey) : '#'}
              icon={BookOpen}
              label="Blog"
              active={pathname.includes('/social/blog')}
              disabled={!projectKey}
            />
          )}
          {showStudio && (
            <SidebarNavItem
              href={projectKey ? studioPath(projectKey) : '#'}
              icon={Wand2}
              label="Studio"
              active={pathname.includes('/studio')}
              disabled={!projectKey}
            />
          )}
          {showCompetitors && (
            <SidebarNavItem
              href={projectKey ? competitorsPath(projectKey) : '#'}
              icon={Radar}
              label="Competitors"
              active={pathname.includes('/competitors')}
              disabled={!projectKey}
            />
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
