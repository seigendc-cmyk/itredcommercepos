import React from 'react';
import { Product, StaffMember } from '../../types';
import { Notice, PageHeader, Surface } from '../Common/ui';

interface TaxFiscalWorkspaceProps {
  view: 'tax' | 'fiscal';
  activeStaff: StaffMember;
  products: Product[];
}

export const TaxFiscalWorkspace: React.FC<TaxFiscalWorkspaceProps> = ({ view, activeStaff, products }) => {
  const authorised = activeStaff.role === 'sysadmin' || activeStaff.role === 'manager';
  const taxView = view === 'tax';
  return (
    <div className="space-y-4">
      <PageHeader
        title={taxView ? 'Tax, VAT & Customs Configuration' : 'Fiscalisation Status'}
        description={taxView
          ? 'Country profiles, effective-dated rates and product customs classification.'
          : 'Commercial sales remain separate from statutory submission status.'}
      />
      {!authorised && <Notice tone="error">Your role cannot administer tax or fiscal configuration.</Notice>}
      <Notice tone="warning">
        {taxView
          ? 'Tax-profile, effective-rate, HS-code and customs persistence services are not present on this branch. Configuration is unavailable and no country rate has been assumed.'
          : 'No fiscal authority adapter or fiscal-status query service is present on this branch. Authority acknowledgements, retry actions and references cannot be displayed.'}
      </Notice>
      <div className="grid gap-4 md:grid-cols-2">
        <Surface className="p-4">
          <h2 className="font-bold">{taxView ? 'Country tax profile and VAT rates' : 'Commercial sale status'}</h2>
          <p className="mt-2 text-sm text-slate-600">
            {taxView
              ? 'Read-only unavailable. A configuration service and approved tax/fiscal/customs SOT are required.'
              : 'Existing completed sales are not changed or deleted by fiscal submission failure.'}
          </p>
        </Surface>
        <Surface className="p-4">
          <h2 className="font-bold">{taxView ? 'Product tax and customs classification' : 'Fiscal submission status'}</h2>
          <p className="mt-2 text-sm text-slate-600">
            {taxView
              ? `${products.filter(product => product.vendorId === activeStaff.vendorId).length} tenant-scoped products are present, but their model has no HS/customs fields.`
              : 'No live submission records are exposed. Retry is unavailable because no authorised retry service exists.'}
          </p>
          {taxView && (
            <Notice className="mt-3">
              A six-digit HS base code can be validated by the UI adapter, but final classification always requires
              verification against the current official tariff. The application does not certify a classification.
            </Notice>
          )}
        </Surface>
      </div>
    </div>
  );
};
