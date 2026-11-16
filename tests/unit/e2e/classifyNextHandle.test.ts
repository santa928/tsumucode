// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { getByRole, queryByRole, within } from '@testing-library/dom';
import { classifyNextHandle } from '../../e2e/helpers/classifyNextHandle';

afterEach(() => {
  document.body.replaceChildren();
});

it('distinguishes matching guide text in the old course map from the Home card', () => {
  const map = document.createElement('article');
  map.setAttribute('data-course-map', '');
  const mapGuide = document.createElement('dd');
  mapGuide.textContent = 'synthetic-private-input';
  map.append(mapGuide);
  document.body.append(map);

  const home = document.createElement('section');
  home.setAttribute('aria-labelledby', 'catalog-title');
  const card = document.createElement('article');
  card.setAttribute('aria-labelledby', 'course-title-next');
  const homeGuide = document.createElement('dd');
  homeGuide.textContent = 'synthetic-private-input';
  card.append(homeGuide);
  home.append(card);
  document.body.append(home);

  expect(classifyNextHandle(mapGuide)).toBe('course-map');
  expect(classifyNextHandle(homeGuide)).toBe('home-card');
});

it('returns unknown instead of guessing from unrelated or partial matching markup', () => {
  const article = document.createElement('article');
  article.setAttribute('aria-labelledby', 'course-title-next');
  const guide = document.createElement('dd');
  article.append(guide);
  document.body.append(article);
  expect(classifyNextHandle(guide)).toBe('unknown');
  expect(classifyNextHandle(document.body)).toBe('unknown');
});

it('shows the old map can satisfy the original role-and-text locator before Home mounts', () => {
  const title = 'Synthetic course title';
  const description = 'synthetic-private-input';
  const map = document.createElement('article');
  map.setAttribute('data-course-map', '');
  map.setAttribute('aria-labelledby', 'course-map-title');
  const heading = document.createElement('h1');
  heading.id = 'course-map-title';
  heading.textContent = title;
  const guide = document.createElement('dd');
  guide.textContent = description;
  map.append(heading, guide);
  document.body.append(map);

  const oldMatch = within(getByRole(document.body, 'article', { name: title })).getByText(
    description,
  );
  expect(classifyNextHandle(oldMatch)).toBe('course-map');
  expect(queryByRole(document.body, 'region', { name: 'Synthetic Home' })).toBeNull();

  const home = document.createElement('section');
  home.setAttribute('aria-labelledby', 'catalog-title');
  const homeHeading = document.createElement('h1');
  homeHeading.id = 'catalog-title';
  homeHeading.textContent = 'Synthetic Home';
  const card = document.createElement('article');
  card.setAttribute('aria-labelledby', 'course-title-next');
  const cardHeading = document.createElement('h3');
  cardHeading.id = 'course-title-next';
  cardHeading.textContent = title;
  const homeGuide = document.createElement('dd');
  homeGuide.textContent = description;
  card.append(cardHeading, homeGuide);
  home.append(homeHeading, card);
  map.replaceWith(home);
  const homeRegion = getByRole(document.body, 'region', { name: 'Synthetic Home' });
  const newMatch = within(within(homeRegion).getByRole('article', { name: title })).getByText(
    description,
  );
  expect(classifyNextHandle(newMatch)).toBe('home-card');
  expect(oldMatch.isConnected).toBe(false);
});
