import { LemonButton, LemonCard } from '@posthog/lemon-ui'
import { IconGithub, IconBranch } from 'lib/lemon-ui/icons'
import { Issue, IssueStatus } from '../types'
import { ORIGIN_PRODUCT_LABELS, ORIGIN_PRODUCT_COLORS } from '../constants'

interface IssueCardProps {
    issue: Issue
    onScope?: (issueId: string) => void
    onClick?: (issueId: string) => void
    draggable?: boolean
}

export function IssueCard({ issue, onScope, onClick, draggable = false }: IssueCardProps): JSX.Element {
    const handleCardClick = (): void => {
        if (onClick) {
            onClick(issue.id)
        }
    }

    return (
        <LemonCard
            className={`p-3 ${draggable ? 'cursor-move' : 'cursor-pointer'}`}
            hoverEffect={true}
            onClick={handleCardClick}
        >
            <div className="flex justify-between items-start mb-2">
                <h4 className="font-medium text-sm leading-tight">{issue.title}</h4>
            </div>

            <p className="text-xs text-muted mb-3 line-clamp-2">{issue.description}</p>

            {/* GitHub Integration Status */}
            {(issue.github_branch || issue.github_pr_url) && (
                <div className="flex items-center gap-1 mb-2">
                    <IconGithub className="text-xs" />
                    {issue.github_branch && (
                        <div className="flex items-center gap-1 text-xs text-muted">
                            <IconBranch />
                            <span className="truncate max-w-32">{issue.github_branch}</span>
                        </div>
                    )}
                    {issue.github_pr_url && (
                        <a
                            href={issue.github_pr_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-link hover:text-link-hover"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <span>↗</span>
                            <span>PR</span>
                        </a>
                    )}
                </div>
            )}

            {/* Repository Information */}
            {issue.repository_scope && (
                <div className="mb-2">
                    <div className="flex items-center gap-2 text-xs text-muted">
                        <span className="font-medium">Repos:</span>
                        {issue.repository_scope === 'single' && issue.primary_repository && (
                            <span className="text-primary">{issue.primary_repository.organization}/{issue.primary_repository.repository}</span>
                        )}
                        {issue.repository_scope === 'multiple' && issue.repository_list && (
                            <span className="text-primary">{issue.repository_list.length} repositories</span>
                        )}
                        {issue.repository_scope === 'smart_select' && (
                            <span className="text-primary">Smart Select</span>
                        )}
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center">
                <span
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        ORIGIN_PRODUCT_COLORS[issue.origin_product]
                    }`}
                >
                    {ORIGIN_PRODUCT_LABELS[issue.origin_product]}
                </span>

                {issue.status === IssueStatus.BACKLOG && onScope && (
                    <LemonButton
                        size="xsmall"
                        type="primary"
                        onClick={(e) => {
                            e.stopPropagation()
                            onScope(issue.id)
                        }}
                    >
                        Scope
                    </LemonButton>
                )}
            </div>
        </LemonCard>
    )
}
