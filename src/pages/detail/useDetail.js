import { useCallback, useEffect, useRef, useState } from "react";
import { describeError } from "../../api/baseapi";
import { DEFAULT_RANGE, findRange, rangeDates } from "../../components/figures";

/**
 * Loading for a drill-down page: one record (`id`) over one preset range, fetched with
 * `fetcher(id, from, to)`. The range starts on the dashboard's default, so clicking through from the
 * dashboard shows the same slice the click was made on.
 *
 * A slow response for an old range or an old record never lands after a newer one, and a refetch
 * keeps the previous figures on screen (the page dims them) instead of flashing a spinner.
 * `notFound` is a 404 - the record is not linked to / owned by this distributor.
 */
export default function useDetail(fetcher, id) {
  const [rangeKey, setRangeKey] = useState(DEFAULT_RANGE);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const request = useRef(0);

  const range = findRange(rangeKey);

  const load = useCallback(() => {
    const seq = ++request.current;
    const { from, to } = rangeDates(range);

    setLoading(true);
    fetcher(id, from, to)
      .then((result) => {
        if (seq !== request.current) return;
        setData(result);
        setError(null);
        setNotFound(false);
      })
      .catch((e) => {
        if (seq !== request.current) return;
        const described = describeError(e, "Could not load these figures.");
        if (described.status === 404) {
          setData(null);
          setNotFound(true);
        }
        setError(described.message);
      })
      .finally(() => {
        if (seq === request.current) setLoading(false);
      });
  }, [fetcher, id, range]);

  // A different record starts clean - the old one's figures must not sit under the new name.
  useEffect(() => {
    setData(null);
    setNotFound(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return { range, rangeKey, setRangeKey, data, loading, error, notFound, reload: load };
}
