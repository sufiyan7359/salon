import { Component, input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  templateUrl: './skeleton.component.html',
  styleUrl: './skeleton.component.scss',
})
export class SkeletonComponent {
  readonly width = input('100%');
  readonly height = input('1rem');
  readonly radius = input('0.5rem');
}
