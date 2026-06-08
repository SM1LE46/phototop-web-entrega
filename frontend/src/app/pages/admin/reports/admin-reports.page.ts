import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';

import {
    AdminReportRow,
    AdminService
} from '../../../core/services/admin.service';

@Component({
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
    templateUrl: './admin-reports.page.html',
    styleUrls: ['./admin-reports.page.scss'],
})
export class AdminReportsPage implements OnInit {
    loading = true;
    reports: AdminReportRow[] = [];

    filters = {
        status: '',
        target_type: '',
    };

    selectedReport: AdminReportRow | null = null;
    selectedStatus: 'open' | 'reviewing' | 'closed' = 'open';
    selectedAction: 'close_only' | 'hide_target' | 'delete_target' | 'deactivate_user' = 'close_only';
    adminReason = '';
    resolving = false;

    constructor(private adminService: AdminService) { }

    ngOnInit(): void {
        this.loadReports();
    }

    loadReports(): void {
        this.loading = true;

        this.adminService.getReports(this.filters).subscribe({
            next: (reports) => {
                this.reports = reports;
                this.loading = false;
            },
            error: (err) => {
                console.error('Error cargando reportes admin', err);
                this.loading = false;
            }
        });
    }

    applyFilters(): void {
        this.loadReports();
    }

    clearFilters(): void {
        this.filters = {
            status: '',
            target_type: '',
        };
        this.loadReports();
    }

    isClosed(report: AdminReportRow): boolean {
        return report.status === 'closed';
    }

    openResolveModal(report: AdminReportRow): void {
        if (this.isClosed(report)) return;

        this.selectedReport = report;
        this.selectedStatus = report.status;
        this.selectedAction = 'close_only';
        this.adminReason = report.admin_reason || '';
    }

    closeResolveModal(): void {
        this.selectedReport = null;
        this.selectedStatus = 'open';
        this.selectedAction = 'close_only';
        this.adminReason = '';
        this.resolving = false;
    }

    submitResolve(): void {
        if (!this.selectedReport) return;

        const report = this.selectedReport;
        const reason = this.adminReason.trim();

        if (!reason) {
            alert('Debes escribir un motivo de moderación.');
            return;
        }

        this.resolving = true;

        if (this.selectedStatus === 'closed') {
            this.adminService.resolveReport(report.id, {
                action: this.selectedAction,
                admin_reason: reason
            }).subscribe({
                next: () => {
                    this.closeResolveModal();
                    this.loadReports();
                },
                error: (err) => {
                    console.error('Error resolviendo reporte', err);
                    this.resolving = false;
                }
            });

            return;
        }

        this.adminService.updateReport(report.id, {
            status: this.selectedStatus,
            admin_reason: reason
        }).subscribe({
            next: () => {
                this.closeResolveModal();
                this.loadReports();
            },
            error: (err) => {
                console.error('Error actualizando estado del reporte', err);
                this.resolving = false;
            }
        });
    }

    deleteReport(report: AdminReportRow): void {
        const confirmed = window.confirm(`¿Quieres borrar el reporte #${report.id}?`);
        if (!confirmed) return;

        this.adminService.deleteReport(report.id).subscribe({
            next: () => this.loadReports(),
            error: (err) => console.error('Error borrando reporte', err)
        });
    }

    getTargetTypeLabel(type: string): string {
        if (type === 'user') return 'Usuario';
        if (type === 'post') return 'Post';
        if (type === 'message') return 'Mensaje';
        return type;
    }

    getStatusLabel(status: string): string {
        if (status === 'open') return 'Abierto';
        if (status === 'reviewing') return 'En revisión';
        if (status === 'closed') return 'Cerrado';
        return status;
    }

    getStatusClass(status: string): string {
        if (status === 'open') return 'status-badge--open';
        if (status === 'reviewing') return 'status-badge--reviewing';
        if (status === 'closed') return 'status-badge--closed';
        return '';
    }
}