'use client';

import { useReviews, useReviewSummary } from '@/hooks/use-reviews';

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < rating ? 'text-amber-400' : 'text-slate-200'}>
          ★
        </span>
      ))}
    </span>
  );
}

function RatingSummaryCard() {
  const { data: summary, loading, error } = useReviewSummary();

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <p className="text-slate-400">Loading summary...</p>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <p className="text-red-500 text-sm">{error ?? 'No summary available'}</p>
      </div>
    );
  }

  const maxCount = summary.distribution.length
    ? Math.max(...summary.distribution.map((d) => d.count))
    : 1;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-6">
        {/* Avg rating */}
        <div className="text-center sm:pr-6 sm:border-r sm:border-slate-200">
          <p className="text-5xl font-bold text-slate-900">
            {parseFloat(summary.avgRating).toFixed(1)}
          </p>
          <p className="text-slate-500 text-sm mt-1">out of 5</p>
          <div className="mt-2">
            <StarRating rating={Math.round(parseFloat(summary.avgRating))} />
          </div>
          <p className="text-xs text-slate-400 mt-1">{summary.totalCount} reviews</p>
        </div>

        {/* Distribution bars */}
        <div className="flex-1 space-y-2">
          {[5, 4, 3, 2, 1].map((star) => {
            const entry = summary.distribution.find((d) => d.rating === star);
            const count = entry?.count ?? 0;
            const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
            return (
              <div key={star} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-3">{star}</span>
                <span className="text-amber-400 text-xs">★</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-amber-400"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-slate-400 w-6 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ReviewsPage() {
  const { data: reviews, loading, error } = useReviews();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Customer Reviews</h1>

      <RatingSummaryCard />

      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : error ? (
        <p className="text-red-500 text-sm">{error}</p>
      ) : reviews.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-10 text-center">
          <p className="text-slate-400 text-sm">No reviews yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Lead</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Rating</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Comment</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Source</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((review) => (
                <tr key={review.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {review.lead?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StarRating rating={review.rating} />
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs">
                    {review.comment
                      ? review.comment.length > 80
                        ? `${review.comment.slice(0, 80)}…`
                        : review.comment
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 capitalize">{review.source}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(review.createdAt).toLocaleDateString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
