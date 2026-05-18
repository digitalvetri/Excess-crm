'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useCreateLead } from '@/hooks/use-leads';

const schema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal('')),
  city: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export function CreateLeadButton() {
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useCreateLead();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  function onSubmit(data: FormData) {
    mutate(
      {
        name: data.name,
        phone: data.phone,
        ...(data.email && { email: data.email }),
        ...(data.city && { city: data.city }),
      },
      {
        onSuccess: () => {
          toast.success('Lead queued for processing');
          reset();
          setOpen(false);
        },
        onError: () => toast.error('Failed to create lead'),
      },
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-light transition-colors"
      >
        <Plus size={16} />
        Add Lead
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-800">Add Manual Lead</h2>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                <input
                  {...register('name')}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Customer name"
                />
                {errors.name && <p className="text-danger text-xs mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone *</label>
                <input
                  {...register('phone')}
                  type="tel"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="+91 9876543210"
                />
                {errors.phone && <p className="text-danger text-xs mt-1">{errors.phone.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  {...register('email')}
                  type="email"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                <input
                  {...register('city')}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Coimbatore"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 border border-border text-slate-700 py-2 rounded-lg text-sm hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-primary-light transition-colors disabled:opacity-50"
                >
                  {isPending ? 'Adding…' : 'Add Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
