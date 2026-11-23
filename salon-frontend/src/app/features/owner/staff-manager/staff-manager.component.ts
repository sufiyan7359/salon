import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, translate } from '@jsverse/transloco';
import { Staff } from '../../../core/models/staff.model';
import { SalonService } from '../../../core/services/salon.service';
import { ToastService } from '../../../core/services/toast.service';
import { extractErrorMessage } from '../../../core/utils/http-error.util';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { fadeIn } from '../../../shared/animations/fade-slide.animation';

@Component({
  selector: 'app-staff-manager',
  imports: [FormsModule, SkeletonComponent, TranslocoPipe],
  templateUrl: './staff-manager.component.html',
  styleUrl: './staff-manager.component.scss',
  animations: [fadeIn],
})
export class StaffManagerComponent implements OnInit {
  private readonly salonService = inject(SalonService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly staff = signal<Staff[]>([]);
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);

  readonly formName = signal('');
  readonly formSpecialization = signal('');

  private salonId = '';

  async ngOnInit(): Promise<void> {
    const salon = this.salonService.salon();
    if (!salon) return;
    this.salonId = salon.id;
    await this.refresh();
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formName.set('');
    this.formSpecialization.set('');
    this.showForm.set(true);
  }

  openEdit(member: Staff): void {
    this.editingId.set(member.id);
    this.formName.set(member.name);
    this.formSpecialization.set(member.specialization ?? '');
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
  }

  async submitForm(): Promise<void> {
    if (!this.formName().trim()) {
      this.toast.error(translate('ownerStaff.toastNameRequired'));
      return;
    }

    this.saving.set(true);
    try {
      const payload = {
        name: this.formName().trim(),
        specialization: this.formSpecialization().trim() || undefined,
      };

      if (this.editingId()) {
        await this.salonService.updateStaff(this.editingId()!, payload);
        this.toast.success(translate('ownerStaff.toastUpdated'));
      } else {
        await this.salonService.createStaff(this.salonId, payload);
        this.toast.success(translate('ownerStaff.toastAdded'));
      }

      this.showForm.set(false);
      await this.refresh();
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  async toggleAvailable(member: Staff): Promise<void> {
    try {
      await this.salonService.updateStaff(member.id, {
        isAvailable: !member.isAvailable,
      });
      await this.refresh();
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    }
  }

  async remove(member: Staff): Promise<void> {
    if (!confirm(translate('ownerStaff.confirmRemove', { name: member.name }))) return;
    try {
      await this.salonService.deleteStaff(member.id);
      this.toast.success(translate('ownerStaff.toastRemoved'));
      await this.refresh();
    } catch (error) {
      this.toast.error(extractErrorMessage(error));
    }
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      this.staff.set(await this.salonService.getStaff(this.salonId));
    } finally {
      this.loading.set(false);
    }
  }
}
