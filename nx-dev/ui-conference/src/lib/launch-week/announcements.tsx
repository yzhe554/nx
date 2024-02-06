import { ButtonLink, SectionHeading } from '@nx/nx-dev/ui-common';

export function LaunchWeekAnnouncements(): JSX.Element {
  return (
    <div className="border-y border-slate-200 dark:border-slate-700">
      <section className="w-full divide-y divide-slate-200  dark:divide-slate-700">
        <article className="mx-auto max-w-screen-lg xl:max-w-screen-xl">
          <div className="px-5 py-12 md:pr-12">
            <p>
              We’ll be sharing new features and content daily during launch
              week, so be sure to keep an eye on this space for all the latest
              info!
            </p>
          </div>
        </article>

        {/* MONDAY */}
        <div>
          <article className="relative overflow-hidden pt-4 mx-auto max-w-screen-lg xl:max-w-screen-xl">
            <div className="px-5 py-12 grid sm:grid-cols-2 sm:gap-8 lg:py-16">
              <div>
                <header>
                  <SectionHeading as="h2" variant="title" id="monday">
                    Monday
                  </SectionHeading>
                  <SectionHeading as="p" variant="display" className="mt-4">
                    Announcing Project Crystal
                  </SectionHeading>
                </header>
                <div className="mt-8 flex gap-16 font-normal">
                  <p className="max-w-xl text-lg text-slate-700 dark:text-slate-400">
                    When working on the next iteration of Nx, one idea
                    consistently emerged: Nx Plugins are powerful and have
                    proven to help large enterprises adopt monorepos,
                    successfully maintaining and scaling them. However, there's
                    definitely a barrier to entry. So, what if Nx Plugins
                    functioned more like VSCode extensions? You simply add them,
                    and they instantly enhance the experience of working with a
                    given tool or technology.
                    <br />
                    This is what Nx Project Crystal is all about.
                  </p>
                </div>
                <div className="action my-6 flex space-x-2">
                  <ButtonLink
                    variant="primary"
                    size="default"
                    href="https://blog.nrwl.io/what-if-nx-plugins-were-more-like-vscode-extensions-dcdad140ae09?source=friends_link&sk=ade76fe8d50d44aafb4d4d89ab882e24"
                    title="Unveiling Project Crystal"
                  >
                    Read the blog post
                  </ButtonLink>
                  <ButtonLink
                    variant="primary"
                    size="default"
                    href="https://youtu.be/wADNsVItnsM"
                    title="Nx - Project Crystal - Youtube Video"
                  >
                    Watch the video
                  </ButtonLink>
                </div>
              </div>
              <div
                aria-hidden="true"
                className="order-first sm:order-last pb-8 relative flex flex-col items-center"
              >
                <img
                  className="rounded-lg"
                  src="/images/launch-nx/proj-crystal-launch.jpg"
                  alt="Nx Project Crystal"
                />
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
